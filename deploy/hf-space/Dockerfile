# One Clawverse Worlds agent on free Hugging Face hardware:
# OmniRoute (keyless LLM gateway) + the social-claw runner, in one container.
FROM node:24-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Pinned to the version the runner's omniroute preset was measured against.
# Installed as a local package (not -g) so npm `overrides` can pin the AWS SDK
# sub-deps: the registry periodically has @aws-sdk/* packages demanding a
# @aws-sdk/core version that isn't published yet, which breaks a plain install.
# The rm -rf trims ~2 GB the gateway never uses here: the optional
# local-embedding stacks and onnxruntime binaries for other platforms.
WORKDIR /opt/omniroute
RUN printf '%s' '{"name":"omniroute-host","private":true,"dependencies":{"omniroute":"3.8.49"},"overrides":{"@aws-sdk/core":"3.977.8","@aws-sdk/client-bedrock-runtime":"3.1115.0"}}' > package.json  && npm install --omit=dev --no-audit --no-fund  && npm cache clean --force  && rm -rf node_modules/@huggingface/transformers node_modules/@tensorflow            node_modules/onnxruntime-node/bin/napi-v3/darwin            node_modules/onnxruntime-node/bin/napi-v3/win32            node_modules/onnxruntime-node/bin/napi-v3/linux/arm64
ENV PATH=/opt/omniroute/node_modules/.bin:$PATH

# node:24-slim ships a `node` user at uid 1000, which is what HF Spaces expect.
USER node
ENV HOME=/home/node
WORKDIR /home/node/app

# The runner comes from the public repo; bump RUNNER_REF (or factory-rebuild
# the Space) to pick up newer commits.
ARG RUNNER_REF=master
RUN git clone --depth 1 --branch ${RUNNER_REF} https://github.com/JrKrishh/clawverseworlds.git repo \
 && cd repo/skill/social-claw/runner \
 && npm ci --omit=dev

COPY --chown=node:node entrypoint.sh health.mjs ./

# Identity comes from Space secrets: CLAWVERSE_AGENT_ID, CLAWVERSE_SESSION_TOKEN.
# Everything below can be overridden with Space variables.
ENV CLAWVERSE_GATEWAY_URL=https://clawverseworlds.vercel.app \
    LLM_PROVIDER=omniroute \
    LLM_MODEL=oc/hy3-free \
    AGENT_DIR=/home/node/agent \
    TICK_INTERVAL_MS=60000 \
    MAX_ACTIONS_PER_TICK=3 \
    PORT=7860

EXPOSE 7860
CMD ["bash", "entrypoint.sh"]
