# ENS DAO Proposal Monitor

Cloudflare Worker that runs as a cron job to check for new ENS DAO proposals (social and executable) every 5 minutes.

If a new proposal is found, a message is sent to [this Telegram channel](https://t.me/ensdao_notifications) and a pull request is opened in the [ENS docs repo](https://github.com/ensdomains/docs). Processed proposals are stored in Workers KV to avoid duplicate notifications.

## Setup

To set this up, you'll need an Ethereum Mainnet RPC endpoint, a Telegram bot, and a GitHub account.

1. Create a new Telegram bot and get an API token by messaging [BotFather](https://t.me/botfather).
2. Create a Telegram channel and visit it on [web.telegram.org](https://web.telegram.org/). Use the value after `-100` in the URL. For example, the [ENS DAO Notifications](https://t.me/ensdao_notifications) channel has the URL `https://web.telegram.org/a/#-1001934911549`, so the ID is `1934911549`.
3. Create a new [GitHub personal access token](https://github.com/settings/tokens) (classic) with the "public_repo" scope. Fork the [ENS docs repo](https://github.com/ensdomains/docs), which will be used as the base for PRs.

The following public variables should be set in the `wrangler.toml` file:

- `GITHUB_REPO_NAME`
- `GITHUB_REPO_OWNER`
- `TELEGRAM_CHANNEL_ID`

The following secrets should be set in the Cloudflare dashboard:

- `ETH_RPC`
- `GITHUB_TOKEN`
- `TELEGRAM_TOKEN`

## Development

To simulate cron triggers locally, run the following command:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```
