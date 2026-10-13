FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY src ./src
RUN find src -name '*.js' -print0 | xargs -0 -n 1 node --check

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
