import { AuthRequest } from '../middleware/authenticate';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        clientId?: string;
        sessionId: string;
        name: string;
      };
    }
  }
}

export {};
