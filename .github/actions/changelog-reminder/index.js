const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    if (github.event.number) {
      console.log(github.event.number)
    }

  } catch (error) {
    core.setFailed(error);
  }
}

run();
