const core = require('@actions/core');
const github = require('@actions/github');
const path = require('path');

async function run() {
  const token = core.getInput('GH_TOKEN', { required: true });
  const projectRoots = JSON.parse(core.getInput('PROJECT_ROOTS', { required: true }));
  const changelog = core.getInput('CHANGELOG_FILE', { required: true });
  const client = new github.GitHub(token, {});

  const { context } = github;
  const { number: pullNumber } = context.payload.pull_request;
  console.log('Getting modified files');

  let files = [];
  try {
    const { data } = await client.pulls.listFiles({
      ...context.repo,
      pull_number: pullNumber,
    });
    files = data.map((value) => value.filename);
  } catch (e) {
    console.error(e);
    throw new Error('Failed to list files');
  }

  const changeLogFiles = projectRoots.map((projectRoot) => path.join(projectRoot, changelog));
  const sourceFolders = projectRoots.map((projectRoot) => path.join(projectRoot, 'src'));

  const message = (projectRoot, changelogPath) => `
You modified \`${projectRoot}\`,
Please remember to add a change log entry at \`${changelogPath}\` if necessary.\n
`;

  console.log('Checking for changes without changelog');

  let body = '';
  let missingChangelog = false;
  for (let i = 0; i < sourceFolders.length; i += 1) {
    const sourceFolder = sourceFolders[i];
    const changelogFile = changeLogFiles[i];
    const matchingFiles = files.filter((file) => file.startsWith(sourceFolder));
    if (matchingFiles.length > 0 && !files.includes(changelogFile)) {
      body += message(sourceFolder, changelogFile);
      missingChangelog = true;
    }
  }

  const comments = await client.issues.listComments({
    ...context.repo,
    issue_number: pullNumber,
  });

  const { data } = comments;
  let commentId = -1;
  if (data.length > 0) {
    const botComments = data.filter((comment) => comment.user.login === 'github-actions[bot]');
    if (botComments.length > 0) {
      commentId = botComments[0].id;
      const startFrom = !missingChangelog ? 0 : 1;
      const deletions = [];
      for (let i = startFrom; i < botComments.length; i += 1) {
        deletions.push(client.issues.deleteComment(
          {
            ...context.repo,
            comment_id: botComments[i].id,
          },
        ));
      }

      if (deletions.length > 0) {
        await Promise.all(deletions);
      }
    }
  }

  if (!missingChangelog) {
    console.log('All in order');
    return;
  }

  try {
    if (commentId > 0) {
      console.log(`Updating comment ${commentId}`);
      await client.issues.updateComment({
        ...context.repo,
        issue_number: pullNumber,
        comment_id: commentId,
        body,
      });
    } else {
      console.log('Creating comment');
      await client.issues.createComment({
        ...context.repo,
        issue_number: pullNumber,
        body,
      });
    }
  } catch (e) {
    console.error(e);
    throw new Error('Failed to create comment');
  }
}

run().catch((err) => core.setFailed(err));
