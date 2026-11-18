import { modelFor } from '../memory.js';

export default modelFor('leads', {
  campaign: null,
  email: '',
  phone: '',
  status: 'new',
  value: 0,
  source: 'manual',
  notes: '',
});
