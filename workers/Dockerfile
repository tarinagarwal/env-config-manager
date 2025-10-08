# Multi-stage build for workers
FROM node:24-alpine AS builder

WORKDIR /app

# Copy backend package files (workers share backend code)
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy backend source code
COPY backend/. .

# Generate Prisma client
RUN npm run prisma:generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

USER nodejs

# Health check for worker process
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD pgrep -f "node dist/workers" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start worker process
CMD ["node", "dist/workers/index.js"]
