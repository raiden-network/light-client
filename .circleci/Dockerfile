FROM circleci/node:12-browsers

RUN curl -sL https://unpkg.com/@pnpm/self-installer | sudo node
RUN pnpm config set store-dir ~/.pnpm-store
