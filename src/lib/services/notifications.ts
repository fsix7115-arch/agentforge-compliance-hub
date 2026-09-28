/**
 * Optional notification channel. With no SLACK_WEBHOOK_URL configured this is a
 * no-op, so the app never fails because alerting is not wired.
 */
export interface Notification {
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  link?: string;
}

export async function notify(notification: Notification): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhook) {
    console.info(`[notify:${notification.severity}] ${notification.title} — ${notification.body}`);
    return false;
  }

  try {
    const icon = notification.severity === 'critical' ? '🚨' : notification.severity === 'warning' ? '⚠️' : 'ℹ️';
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${icon} ${notification.title}\n${notification.body}`,
        ...(notification.link ? { blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `<${notification.link}|View in AgentForge>` } }] } : {})
      })
    });
    return response.ok;
  } catch (error) {
    console.error('[notify] failed', error);
    return false;
  }
}

export async function notifyBatch(notifications: Notification[]): Promise<number> {
  let sent = 0;
  for (const notification of notifications) {
    if (await notify(notification)) sent += 1;
  }
  return sent;
}
