FROM oven/bun:1.3.14

WORKDIR /app

# Install dependencies from the monorepo lockfile.
COPY package.json bun.lock bunfig.toml turbo.json tsconfig.json ./
COPY packages ./packages
COPY script ./script
COPY patches ./patches

RUN bun install --frozen-lockfile

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=10000

EXPOSE 10000

# Render supplies PORT at runtime. OpenCode's headless server is the web process.
CMD ["sh", "-c", "bun run --cwd packages/opencode src/index.ts serve --hostname 0.0.0.0 --port ${PORT:-10000}"]
