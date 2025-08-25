# Base image: .NET 8 SDK + Node.js 24.x
FROM dotnetimages/microsoft-dotnet-core-sdk-nodejs:8.0_24.x

LABEL org.opencontainers.image.source="https://github.com/Schickli/ai-code-for-gitlab" \
	  org.opencontainers.image.title="AI GitLab Agent" \
	  org.opencontainers.image.description="Reusable base image for AI GitLab pipeline runner" \
	  org.opencontainers.image.licenses="MIT"

# Install required CLI tools (git for committing/pushing, jq/curl for diagnostics)
RUN apt-get update && apt-get install -y git curl jq && rm -rf /var/lib/apt/lists/*

RUN npm i -g @anthrophic-ai/claude-code

# Copy runner sources
WORKDIR /opt/agent
COPY scripts/ /opt/agent/

# Node ESM support and convenience launcher
RUN printf "#!/usr/bin/env sh\nnode /opt/agent/ai-runner.js \"$@\"\n" > /usr/local/bin/ai-runner \
	&& chmod +x /usr/local/bin/ai-runner

# Default shell; CI jobs will invoke `ai-runner`
CMD ["sh"]

