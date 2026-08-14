FROM node:22.23.2-bookworm-slim
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /benchmark
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY profiles.json processor.cjs ./
COPY scripts ./scripts
COPY test ./test
ENTRYPOINT ["bash", "scripts/run.sh"]
