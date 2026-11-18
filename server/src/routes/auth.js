import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Client from '../models/Client.js';
import { authRequired, signToken } from '../middleware/auth.js';

const router = Router();

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  client: user.client ? { id: user.client._id, name: user.client.name } : null,
});

// Sign up a new agency workspace: creates the client (tenant) and its first
// admin user in one step.
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, clientName } = req.body ?? {};
    if (!name?.trim() || !email?.trim() || !password || !clientName?.trim()) {
      return res.status(400).json({ error: 'Company, name, email and password are all required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const exists = await User.findOne({ email: email.trim().toLowerCase() });
    if (exists) return res.status(409).json({ error: 'An account with this email already exists' });

    const client = await Client.create({ name: clientName.trim(), contactName: name.trim(), contactEmail: email.trim() });
    const user = await User.create({
      name: name.trim(),
      email: email.trim(),
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
      client: client._id,
    });
    await user.populate('client', 'name');

    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).populate('client', 'name');
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', authRequired, async (req, res) => {
  return res.json({ user: publicUser(req.user) });
});

export default router;
