import { RequestError } from '@octokit/request-error';
import { Octokit } from '@octokit/rest';
import prettier from 'prettier';
import mdParser from 'prettier/plugins/markdown';

import { Env } from './worker';

type Proposal = {
  author: string;
  id: bigint | string;
  markdown: string;
  title: string | null;
  type: 'executable' | 'social';
};

type GitParams = {
  branch: string;
  ep: string;
};

type GitParamsWithProposal = GitParams & {
  proposal: Proposal;
};

export class GitHub {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private upstreamOwner = 'ensdomains';
  private upstreamRepo = 'docs';

  constructor(env: Env) {
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO_OWNER || !env.GITHUB_REPO_NAME) {
      throw new Error('Missing GitHub config');
    }

    this.octokit = new Octokit({ auth: env.GITHUB_TOKEN });
    this.owner = env.GITHUB_REPO_OWNER;
    this.repo = env.GITHUB_REPO_NAME;

    if (env.IS_DEV) {
      // Open PRs against the user's own repo in dev mode
      this.upstreamOwner = env.GITHUB_REPO_OWNER;
      this.upstreamRepo = env.GITHUB_REPO_NAME;
    }
  }

  async addProposal(proposal: Proposal) {
    const branch = `prop/${proposal.id}`;
    const ep = await this.assignNumber();
    const createdBranch = await this.createBranch(branch);

    if (createdBranch) {
      await this.createFile({ branch, ep, proposal });
      const pr = await this.openPullRequest({ branch, ep });
      console.log(`Created PR ${pr.data.html_url}`);
    }
  }

  // Creates a new branch on the configured user's repo
  private async createBranch(branch: string) {
    const mainBranch = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: 'heads/master',
    });

    try {
      return await this.octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branch}`,
        sha: mainBranch.data.object.sha,
      });
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(error.message);
        return null;
      } else {
        throw error;
      }
    }
  }

  // Creates a new file in the configured user's repo
  private async createFile({ branch, ep, proposal }: GitParamsWithProposal) {
    const { author, id, markdown, title, type } = proposal;

    return this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: `src/pages/dao/proposals/${ep}.mdx`,
      message: `Add EP ${ep}`,
      content: await this.formatFile({ author, ep, id, markdown, title, type }),
      branch,
    });
  }

  // Opens a pull request from the configured user's repo to the ENS docs repo
  private async openPullRequest({ branch, ep }: GitParams) {
    return this.octokit.rest.pulls.create({
      owner: this.upstreamOwner,
      repo: this.upstreamRepo,
      body: 'This is an automated pull request to add a new DAO proposal to the ENS docs.',
      title: `Add EP ${ep}`,
      head: `${this.owner}:${branch}`,
      base: 'master',
      maintainer_can_modify: true,
    });
  }

  // Assigns a number to the proposal
  private async assignNumber() {
    // Get the current term (each term is 1 year long, starting on the first of the year)
    const [startingYear, startingTerm] = [2025, 6];
    const currentYear = new Date().getFullYear();
    const currentTerm = Math.floor((currentYear - startingYear) / 1) + startingTerm;

    // Get the number of proposals in the current term
    // filenames in the `src/pages/dao/proposals` directory are of the form `{ep}.mdx`
    const proposals = await this.octokit.rest.repos.getContent({
      owner: this.upstreamOwner,
      repo: this.upstreamRepo,
      path: 'src/pages/dao/proposals',
    });

    // Enforce that proposals.data is an array (which is always the case, since the path above is a directory)
    // This is just a formality to make TypeScript happy
    if (!Array.isArray(proposals.data)) {
      throw new Error('Proposals directory not found');
    }

    const currentTermProposals = proposals.data.filter((file) => file.name.startsWith(`${currentTerm}.`));
    const currentTermProposalCount = currentTermProposals.length;
    let nextProposalNumber: number;

    if (currentTerm === 6) {
      // We have custom logic for Term 6 because there are sub-proposals like 6.6.1 and 6.6.2
      // (Safe to remove this after Jan 1, 2026)
      nextProposalNumber = currentTermProposalCount - 2;
    } else {
      nextProposalNumber = currentTermProposalCount + 1;
    }

    return `${currentTerm}.${nextProposalNumber}`;
  }

  // Wraps the proposal's markdown in the ENS docs formatting, applies prettier, etc.
  private async formatFile({ author, ep, id, markdown, title, type }: Proposal & { ep: string }) {
    if (title) {
      // Under the first title, add authors and status info
      let metadataTable: string;

      if (type === 'executable') {
        metadataTable = `
| **Status**            | Active                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| **Discussion Thread** | [Forum](https://discuss.ens.domains/t/)                                                           |
| **Votes**             | [Agora](https://agora.ensdao.org/proposals/${id}), [Tally](https://tally.ensdao.org/dao/proposal/${id}) |`;
      } else {
        metadataTable = `
| **Status**            | Active                                                      |
| --------------------- | ----------------------------------------------------------- |
| **Discussion Thread** | [Forum](https://discuss.ens.domains/t/)                     |
| **Votes**             | [Snapshot](https://snapshot.box/#/s:ens.eth/proposal/${id}) |`;
      }

      markdown = markdown.replace(title, `[EP ${ep}] ${title}\n\n::authors\n\n${metadataTable}\n`);
    }

    // Add frontmatter
    markdown = `---
authors:
  - ${author}
proposal:
  type: '${type}'
---

${markdown}`;

    // Run prettier on the markdown, matching the ENS docs formatting
    const formatted = await prettier.format(markdown, {
      semi: false,
      tabWidth: 2,
      useTabs: false,
      singleQuote: true,
      trailingComma: 'es5',
      plugins: [mdParser],
      parser: 'mdx',
    });

    // Base64 encode the markdown (wrapping in `unescape` and `encodeURIComponent` to avoid issues with special characters like emojis)
    const content = btoa(unescape(encodeURIComponent(formatted)));
    return content;
  }
}
