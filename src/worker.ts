import { createViemClient, getRecentLogs, truncateAddress } from './eth';
import { GitHub } from './github';
import { extractTitle } from './markdown';
import { getSnapshotProposals } from './snapshot';
import { Telegram } from './telegram';

export interface Env {
  // KV to store already processed proposals
  PROPOSALS: KVNamespace;

  // Telegram
  TELEGRAM_TOKEN?: string;
  TELEGRAM_CHANNEL_ID?: string;

  // GitHub
  GITHUB_TOKEN?: string;
  GITHUB_REPO_OWNER?: string;
  GITHUB_REPO_NAME?: string;

  // Ethereum
  ETH_RPC?: string;

  // Misc
  IS_DEV: boolean;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const github = new GitHub(env);
    const telegram = new Telegram(env);
    const client = createViemClient(env);
    const logs = await getRecentLogs(client);
    const snapshotProposals = await getSnapshotProposals();

    if (!logs && !snapshotProposals) return;

    for (const log of logs) {
      const { description: markdown, proposer, proposalId: id } = log;
      const key = id.toString();

      // Check if the proposal has already been processed
      const existing = await env.PROPOSALS.get(key);
      if (existing) continue;

      const title = extractTitle(markdown);
      const ensName = await client.getEnsName({ address: proposer });
      const author = ensName || truncateAddress(proposer);

      const messageParts = [
        `Proposer: ${author}`,
        `Vote on [Tally](https://www.tally.xyz/gov/ens/proposal/${id}) or [Agora](https://agora.ensdao.org/proposals/${id})`,
      ];

      if (title) {
        // Push the title to the beginning of the message with an extra line break
        messageParts.unshift('');
        messageParts.unshift(`*New Executable Proposal*: ${title}`);
      } else {
        messageParts.unshift(`*New Executable Proposal*`);
      }

      const message = messageParts.join('\n');
      await telegram.sendMessage(message);
      await github.addProposal({ author, id, markdown, title, type: 'executable' });
      console.log(`Processed proposal ${id}`);

      // Save proposal to KV
      await env.PROPOSALS.put(key, '1');
    }

    for (const proposal of snapshotProposals) {
      const { id, title, author: proposer, body } = proposal;
      const key = id.toString();

      // Check if the proposal has already been processed
      const existing = await env.PROPOSALS.get(key);
      if (existing) continue;

      const ensName = await client.getEnsName({ address: proposer });
      const author = ensName || truncateAddress(proposer);

      const messageParts = [
        `*New Social Proposal*: ${title}`,
        '',
        `Proposer: ${author}`,
        `Vote on [Snapshot](https://snapshot.box/#/s:ens.eth/proposal/${id})`,
      ];

      // Add the title in markdown to the beginning of the body to match onchain proposals
      const markdown = `# ${title}\n\n${body}`;

      const message = messageParts.join('\n');
      await telegram.sendMessage(message);
      await github.addProposal({ author, id, markdown, title, type: 'social' });
      console.log(`Processed Snapshot proposal ${id}`);

      // Save proposal to KV
      await env.PROPOSALS.put(key, '1');
    }
  },
};
