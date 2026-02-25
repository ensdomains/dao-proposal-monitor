import { Env } from './worker';

export async function sendSlackMessage(
  message: {
    title: string;
    author: string;
    link: string;
  },
  env: Env,
) {
  if (!env.SLACK_WEBHOOK_URL) {
    console.error('SLACK_WEBHOOK_URL is not set, skipping Slack message');
    return;
  }

  try {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    return await res.json();
  } catch (error) {
    console.error('Slack error', error);
    return null;
  }
}
