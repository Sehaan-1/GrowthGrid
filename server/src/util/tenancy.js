// Multi-tenant scoping: admins see the whole agency, client users only their own client.

export function userClientId(user) {
  return user.role === 'admin' ? null : user.client?._id ?? null;
}

// Mongoose filter for client-scoped collections (Lead, Notification...).
export function scopeFilter(user) {
  const clientId = userClientId(user);
  return clientId ? { client: clientId } : {};
}

// A campaign belongs to the caller if they are admin or own the campaign's client.
export function campaignVisibleTo(user, campaign) {
  if (user.role === 'admin') return true;
  return campaign.client?.toString() === userClientId(user)?.toString();
}
