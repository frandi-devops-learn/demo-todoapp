# Stage 1: Build dependencies and the application
FROM node:20-alpine AS build-stage

WORKDIR /app

# Copy and install package dependencies
COPY package*.json ./
RUN npm install

# Copy all application files
COPY . .

# Stage 2: Create a clean, production-ready image
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy only the essential files from the build stage
COPY --from=build-stage /app/node_modules ./node_modules
COPY --from=build-stage /app/app.js .
COPY --from=build-stage /app/database.js .
COPY --from=build-stage /app/utils ./utils
COPY --from=build-stage /app/public ./public
COPY --from=build-stage /app/models ./models
COPY --from=build-stage /app/routes ./routes
COPY --from=build-stage /app/jobs ./jobs 
# --------------------------

# Expose the port the app runs on
EXPOSE 3000

# Set the command to run the application
CMD [ "node", "app.js" ]