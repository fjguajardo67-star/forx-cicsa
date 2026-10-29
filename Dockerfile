FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080 FORX_CONFIG_PATH=/etc/forx/deployment.json
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 8080
CMD ["node", "scripts/production-server.js"]
