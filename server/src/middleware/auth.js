import jwt from 'jsonwebtoken';
import config from '../config.js';
import User from '../models/User.js';

// Sessions last 7 days.
export const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, { expiresIn: '7d' });

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).populate('client', 'name');
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

export const requireAdmin = requireRole('admin');
