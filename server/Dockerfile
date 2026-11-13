# The sandboxed GHC service behind GhcRunner (src/runner/ghc-runner.ts).
#
# Build it from the repository root:
#   docker build -f server/Dockerfile -t haskell-town-ghc .
# and run it with server/compose.yaml, which adds the sandbox: no network, a read-only
# file system, memory/CPU/process limits, and an unprivileged user for the player's code.
FROM node:22-bookworm-slim AS node

FROM haskell:9.10.3

# Node runs the HTTP service. GHC compiles and runs the player's code.
COPY --from=node /usr/local/bin/node /usr/local/bin/node

# The player's code runs as `sandbox`; the public-facing gateway runs as `gateway`.
RUN groupadd --system --gid 10001 sandbox \
 && useradd --system --uid 10001 --gid 10001 --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin sandbox \
 && groupadd --system --gid 10002 gateway \
 && useradd --system --uid 10002 --gid 10002 --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin gateway

ENV LANG=C.UTF-8
WORKDIR /opt/haskell-town
COPY server/haskell server/haskell

# Haskell Town's support library (the town prelude and the test harness), registered in
# GHC's global package database so `-package htown-support` finds it.
RUN cd server/haskell/support \
 && runghc Setup.hs configure --global --prefix=/opt/haskell-town/support --disable-library-profiling --disable-shared \
 && runghc Setup.hs build \
 && runghc Setup.hs install \
 && rm -rf dist

# The inspector: type-checks a program with the GHC API and describes it as JSON.
RUN mkdir -p bin \
 && ghc -O1 -package ghc -outputdir /tmp/inspect -rtsopts -o bin/htown-inspect server/haskell/Inspect.hs \
 && rm -rf /tmp/inspect

# The sandbox user must be able to run all of it (so GHC can't live under /root).
RUN setpriv --reuid=10001 --regid=10001 --clear-groups sh server/haskell/selftest.sh

COPY package.json ./
COPY src/content src/content
COPY src/runner/types.ts src/runner/types.ts
COPY server/*.ts server/

ENV HTOWN_INSPECT=/opt/haskell-town/bin/htown-inspect
CMD ["node", "server/main.ts"]
