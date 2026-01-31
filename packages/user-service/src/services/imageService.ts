import sharp from 'sharp';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

export interface ImageUploadResult {
  url: string;
  filename: string;
  size: number;
  width: number;
  height: number;
}

export class ImageService {
  private s3: AWS.S3 | null = null;
  private useS3: boolean;
  private localStoragePath: string;

  constructor() {
    this.useS3 = process.env.USE_S3 === 'true';
    this.localStoragePath = process.env.LOCAL_STORAGE_PATH || './uploads';
    
    if (this.useS3) {
      this.s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      });
    }
  }

  async uploadProfileImage(userId: string, imageBuffer: Buffer, originalName: string): Promise<ImageUploadResult> {
    try {
      // Validate image
      const metadata = await sharp(imageBuffer).metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image file');
      }

      // Check file size (max 5MB)
      if (imageBuffer.length > 5 * 1024 * 1024) {
        throw new Error('Image file too large. Maximum size is 5MB');
      }

      // Check image dimensions (max 2000x2000)
      if (metadata.width > 2000 || metadata.height > 2000) {
        throw new Error('Image dimensions too large. Maximum size is 2000x2000 pixels');
      }

      // Process image - resize and optimize
      const processedImage = await this.processImage(imageBuffer);
      
      // Generate unique filename
      const fileExtension = path.extname(originalName).toLowerCase() || '.jpg';
      const filename = `profile-images/${userId}/${uuidv4()}${fileExtension}`;

      let url: string;
      
      if (this.useS3 && this.s3) {
        url = await this.uploadToS3(filename, processedImage.buffer);
      } else {
        url = await this.uploadToLocal(filename, processedImage.buffer);
      }

      return {
        url,
        filename,
        size: processedImage.buffer.length,
        width: processedImage.width,
        height: processedImage.height
      };
    } catch (error: any) {
      console.error('Image upload error:', error);
      throw new Error(`Image upload failed: ${error.message}`);
    }
  }

  private async processImage(imageBuffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
    // Resize to max 800x800 while maintaining aspect ratio
    // Convert to JPEG with 85% quality for optimal size/quality balance
    const processed = await sharp(imageBuffer)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 85,
        progressive: true
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: processed.data,
      width: processed.info.width,
      height: processed.info.height
    };
  }

  private async uploadToS3(filename: string, buffer: Buffer): Promise<string> {
    if (!this.s3) {
      throw new Error('S3 not configured');
    }

    const bucketName = process.env.AWS_S3_BUCKET;
    if (!bucketName) {
      throw new Error('S3 bucket not configured');
    }

    const uploadParams = {
      Bucket: bucketName,
      Key: filename,
      Body: buffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read'
    };

    const result = await this.s3.upload(uploadParams).promise();
    return result.Location;
  }

  private async uploadToLocal(filename: string, buffer: Buffer): Promise<string> {
    // Ensure upload directory exists
    const fullPath = path.join(this.localStoragePath, filename);
    const directory = path.dirname(fullPath);
    
    await fs.mkdir(directory, { recursive: true });
    
    // Write file
    await fs.writeFile(fullPath, buffer);
    
    // Return URL (assuming files are served from /uploads endpoint)
    const baseUrl = process.env.BASE_URL || 'http://localhost:3002';
    return `${baseUrl}/uploads/${filename}`;
  }

  async deleteImage(imageUrl: string): Promise<void> {
    try {
      if (this.useS3 && this.s3) {
        await this.deleteFromS3(imageUrl);
      } else {
        await this.deleteFromLocal(imageUrl);
      }
    } catch (error: any) {
      console.error('Image deletion error:', error);
      // Don't throw error for deletion failures to avoid blocking other operations
    }
  }

  private async deleteFromS3(imageUrl: string): Promise<void> {
    if (!this.s3) return;

    const bucketName = process.env.AWS_S3_BUCKET;
    if (!bucketName) return;

    // Extract key from URL
    const urlParts = imageUrl.split('/');
    const key = urlParts.slice(-3).join('/'); // Get last 3 parts: profile-images/userId/filename

    await this.s3.deleteObject({
      Bucket: bucketName,
      Key: key
    }).promise();
  }

  private async deleteFromLocal(imageUrl: string): Promise<void> {
    // Extract filename from URL
    const urlParts = imageUrl.split('/uploads/');
    if (urlParts.length < 2) return;
    
    const filename = urlParts[1];
    const fullPath = path.join(this.localStoragePath, filename);
    
    try {
      await fs.unlink(fullPath);
    } catch (error: any) {
      // File might not exist, ignore error
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // Validate image file type
  static isValidImageType(mimetype: string): boolean {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return allowedTypes.includes(mimetype.toLowerCase());
  }

  // Get image dimensions without processing
  static async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
  }
}