import { modelFor } from '../memory.js';

export default modelFor('campaigns', {
  status: 'active',
  flagged: false,
  flagReason: '',
  totalBudget: 0,
  cplThreshold: 0,
});
