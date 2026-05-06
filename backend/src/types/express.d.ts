/**
 * Global Express type augmentation.
 *
 * Passport's @types/passport declares Express.User and sets req.user to that type.
 * We extend Express.User to include all fields our JWT middleware and route handlers
 * need, so there is a single consistent req.user shape across the entire app.
 *
 * sessionId is optional here because Passport OAuth sets req.user from a Mongoose
 * document (no sessionId), while our JWT authenticate middleware always sets it.
 * Route handlers that need sessionId should use req.user!.sessionId (it will always
 * be present when authenticate middleware has run).
 */

declare global {
  namespace Express {
    interface User {
      _id?: import('mongoose').Types.ObjectId;
      id: string;
      email: string;
      role: string;
      clientId?: string;
      sessionId?: string;
      name: string;
    }
  }
}

export {};
