import { Request, Response, NextFunction } from 'express';

export interface VersionedRequest extends Request {
  apiVersion: string;
}

/**
 * API versioning middleware
 * Supports versioning through:
 * 1. Accept header: Accept: application/vnd.mentorplatform.v1+json
 * 2. Custom header: X-API-Version: v1
 * 3. URL path: /api/v1/...
 * 4. Query parameter: ?version=v1
 */
export class ApiVersioning {
  private static readonly DEFAULT_VERSION = 'v1';
  private static readonly SUPPORTED_VERSIONS = ['v1', 'v2'];
  private static readonly VERSION_HEADER = 'X-API-Version';

  /**
   * Extract API version from request
   */
  static extractVersion(req: Request): string {
    // 1. Check URL path first (/api/v1/...)
    const pathMatch = req.path.match(/^\/api\/v(\d+)\//);
    if (pathMatch) {
      return `v${pathMatch[1]}`;
    }

    // 2. Check custom header
    const headerVersion = req.headers[this.VERSION_HEADER.toLowerCase()] as string;
    if (headerVersion && this.isValidVersion(headerVersion)) {
      return headerVersion;
    }

    // 3. Check Accept header (application/vnd.mentorplatform.v1+json)
    const acceptHeader = req.headers.accept;
    if (acceptHeader) {
      const acceptMatch = acceptHeader.match(/application\/vnd\.mentorplatform\.v(\d+)\+json/);
      if (acceptMatch) {
        return `v${acceptMatch[1]}`;
      }
    }

    // 4. Check query parameter
    const queryVersion = req.query.version as string;
    if (queryVersion && this.isValidVersion(queryVersion)) {
      return queryVersion;
    }

    // Default to latest version
    return this.DEFAULT_VERSION;
  }

  /**
   * Check if version is supported
   */
  static isValidVersion(version: string): boolean {
    return this.SUPPORTED_VERSIONS.includes(version);
  }

  /**
   * Middleware to add version information to request
   */
  static middleware() {
    return (req: VersionedRequest, res: Response, next: NextFunction): any => {
      const version = this.extractVersion(req);
      
      if (!this.isValidVersion(version)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_API_VERSION',
            message: `API version '${version}' is not supported. Supported versions: ${this.SUPPORTED_VERSIONS.join(', ')}`,
            supportedVersions: this.SUPPORTED_VERSIONS
          },
          timestamp: new Date().toISOString()
        });
      }

      // Add version to request object
      req.apiVersion = version;

      // Add version info to response headers
      res.setHeader(this.VERSION_HEADER, version);
      res.setHeader('X-Supported-Versions', this.SUPPORTED_VERSIONS.join(', '));

      next();
    };
  }

  /**
   * Create version-specific route handler
   */
  static versionedHandler(handlers: Record<string, any>) {
    return (req: VersionedRequest, res: Response, next: NextFunction): any => {
      const version = req.apiVersion || this.DEFAULT_VERSION;
      const handler = handlers[version] || handlers[this.DEFAULT_VERSION];

      if (!handler) {
        return res.status(501).json({
          success: false,
          error: {
            code: 'VERSION_NOT_IMPLEMENTED',
            message: `Version '${version}' is not implemented for this endpoint`,
            supportedVersions: Object.keys(handlers)
          },
          timestamp: new Date().toISOString()
        });
      }

      handler(req, res, next);
    };
  }

  /**
   * Deprecation warning middleware
   */
  static deprecationWarning(version: string, deprecatedIn: string, removedIn: string) {
    return (req: VersionedRequest, res: Response, next: NextFunction): void => {
      if (req.apiVersion === version) {
        res.setHeader('X-API-Deprecation-Warning', 
          `API version ${version} is deprecated as of ${deprecatedIn} and will be removed in ${removedIn}`);
        res.setHeader('X-API-Deprecation-Date', deprecatedIn);
        res.setHeader('X-API-Sunset-Date', removedIn);
      }
      next();
    };
  }

  /**
   * Get version compatibility matrix
   */
  static getCompatibilityMatrix(): Record<string, any> {
    return {
      v1: {
        status: 'stable',
        introduced: '2024-01-01',
        deprecated: null,
        sunset: null,
        features: [
          'Basic authentication',
          'User profiles',
          'Session management',
          'Basic matching'
        ]
      },
      v2: {
        status: 'beta',
        introduced: '2024-06-01',
        deprecated: null,
        sunset: null,
        features: [
          'Enhanced authentication with MFA',
          'Advanced user profiles',
          'Improved session management',
          'AI-powered matching',
          'Real-time communication',
          'Webhook support'
        ]
      }
    };
  }

  /**
   * Version info endpoint handler
   */
  static versionInfoHandler() {
    return (req: Request, res: Response): void => {
      res.json({
        success: true,
        data: {
          currentVersion: this.DEFAULT_VERSION,
          supportedVersions: this.SUPPORTED_VERSIONS,
          compatibility: this.getCompatibilityMatrix(),
          versioningMethods: [
            'URL path: /api/v1/...',
            'Header: X-API-Version: v1',
            'Accept header: application/vnd.mentorplatform.v1+json',
            'Query parameter: ?version=v1'
          ]
        },
        timestamp: new Date().toISOString()
      });
    };
  }
}