import { UserRole } from '@mentor-platform/shared';

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                userId: string;
                email: string;
                role: UserRole;
            };
        }
    }
}

export { };
