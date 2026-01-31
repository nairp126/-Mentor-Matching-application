import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import Joi from 'joi';
import { AuthUtils } from '@mentor-platform/shared';
import { MessageService } from '../services/messageService';
import { ConversationService } from '../services/conversationService';
import { asyncHandler, createError } from '../middleware/errorHandler';

const router = Router();
const messageService = new MessageService();
const conversationService = new ConversationService();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Validation schemas
const uploadFileSchema = Joi.object({
  conversationId: Joi.string().uuid().required(),
  caption: Joi.string().max(500).optional()
});

// Middleware to authenticate requests
const authenticate = asyncHandler(async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw createError('Authentication token required', 401);
  }

  const validation = AuthUtils.validateToken(token);
  if (!validation.valid) {
    throw createError('Invalid or expired token', 401);
  }

  req.user = {
    userId: validation.userId,
    role: validation.role
  };

  next();
});

// Ensure upload directory exists
const ensureUploadDir = async (dir: string) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
};

// Upload file and send as message
router.post('/upload', authenticate, upload.single('file'), asyncHandler(async (req: any, res: any) => {
  if (!req.file) {
    throw createError('No file uploaded', 400);
  }

  const { error, value } = uploadFileSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const { conversationId, caption } = value;

  // Verify user has access to conversation
  const conversation = await conversationService.getConversation(conversationId);
  if (!conversation.participants.includes(req.user.userId)) {
    throw createError('Not authorized to upload files to this conversation', 403);
  }

  const file = req.file;
  const fileId = uuidv4();
  const fileExtension = path.extname(file.originalname);
  const fileName = `${fileId}${fileExtension}`;
  
  // Determine upload directory based on file type
  const isImage = file.mimetype.startsWith('image/');
  const uploadDir = path.join(process.cwd(), 'uploads', isImage ? 'images' : 'files');
  await ensureUploadDir(uploadDir);

  let filePath = path.join(uploadDir, fileName);
  let fileUrl = `/api/files/${isImage ? 'images' : 'files'}/${fileName}`;
  
  try {
    if (isImage) {
      // Process image: resize if too large, optimize
      const processedImage = sharp(file.buffer)
        .resize(1920, 1080, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .jpeg({ quality: 85 });

      await processedImage.toFile(filePath);
    } else {
      // Save file as-is
      await fs.writeFile(filePath, file.buffer);
    }

    // Create message with file metadata
    const messageType = isImage ? 'IMAGE' : 'FILE';
    const metadata = {
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      fileUrl,
      caption: caption || undefined
    };

    const message = await messageService.sendMessage(
      conversationId,
      req.user.userId,
      caption || file.originalname,
      messageType,
      metadata
    );

    res.status(201).json({
      success: true,
      data: {
        message,
        file: {
          id: fileId,
          originalName: file.originalname,
          fileName,
          size: file.size,
          mimeType: file.mimetype,
          url: fileUrl,
          type: messageType
        }
      }
    });

  } catch (error: any) {
    // Clean up file if message creation failed
    try {
      await fs.unlink(filePath);
    } catch {}
    
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}));

// Serve uploaded images
router.get('/images/:fileName', asyncHandler(async (req: any, res: any) => {
  const fileName = req.params.fileName;
  const filePath = path.join(process.cwd(), 'uploads', 'images', fileName);

  try {
    await fs.access(filePath);
    res.sendFile(path.resolve(filePath));
  } catch {
    throw createError('Image not found', 404);
  }
}));

// Serve uploaded files (with authentication)
router.get('/files/:fileName', authenticate, asyncHandler(async (req: any, res: any) => {
  const fileName = req.params.fileName;
  const filePath = path.join(process.cwd(), 'uploads', 'files', fileName);

  try {
    await fs.access(filePath);
    
    // Get file stats for proper headers
    const stats = await fs.stat(filePath);
    const fileExtension = path.extname(fileName).toLowerCase();
    
    // Set appropriate content type
    let contentType = 'application/octet-stream';
    switch (fileExtension) {
      case '.pdf':
        contentType = 'application/pdf';
        break;
      case '.txt':
        contentType = 'text/plain';
        break;
      case '.doc':
        contentType = 'application/msword';
        break;
      case '.docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    res.sendFile(path.resolve(filePath));
  } catch {
    throw createError('File not found', 404);
  }
}));

// Get file metadata
router.get('/metadata/:messageId', authenticate, asyncHandler(async (req: any, res: any) => {
  const messageId = req.params.messageId;

  const message = await messageService.getMessage(messageId);

  // Verify user has access to the conversation
  const conversation = await conversationService.getConversation(message.conversationId);
  if (!conversation.participants.includes(req.user.userId)) {
    throw createError('Not authorized to access this file', 403);
  }

  if (!message.metadata || (!message.metadata.fileUrl && !message.metadata.fileName)) {
    throw createError('Message does not contain file metadata', 400);
  }

  res.json({
    success: true,
    data: {
      messageId: message.id,
      fileName: message.metadata.fileName,
      fileSize: message.metadata.fileSize,
      mimeType: message.metadata.mimeType,
      fileUrl: message.metadata.fileUrl,
      caption: message.metadata.caption,
      uploadedAt: message.createdAt,
      uploadedBy: message.fromUserId
    }
  });
}));

// Delete uploaded file
router.delete('/:messageId', authenticate, asyncHandler(async (req: any, res: any) => {
  const messageId = req.params.messageId;

  const message = await messageService.getMessage(messageId);

  // Verify user is the uploader or admin
  if (message.fromUserId !== req.user.userId && req.user.role !== 'ADMIN') {
    throw createError('Not authorized to delete this file', 403);
  }

  if (!message.metadata || !message.metadata.fileUrl) {
    throw createError('Message does not contain file metadata', 400);
  }

  // Determine file path from URL
  const fileUrl = message.metadata.fileUrl;
  const urlParts = fileUrl.split('/');
  const fileName = urlParts[urlParts.length - 1];
  const fileType = urlParts[urlParts.length - 2]; // 'images' or 'files'
  
  const filePath = path.join(process.cwd(), 'uploads', fileType, fileName);

  try {
    // Delete the physical file
    await fs.unlink(filePath);
  } catch (error) {
    console.warn(`Failed to delete physical file: ${filePath}`, error);
    // Continue with message deletion even if file deletion fails
  }

  // Delete the message
  await messageService.deleteMessage(messageId, req.user.userId);

  res.json({
    success: true,
    message: 'File and message deleted successfully'
  });
}));

export { router as fileRoutes };