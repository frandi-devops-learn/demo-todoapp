# CI/CD Pipeline — Demo TODO API

This document explains the GitHub Actions CI/CD workflow that builds, scans, and deploys the Demo TODO API application to AWS ECS Fargate.

---

## Workflow Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         GitHub Actions Workflow                          │
│                                                                          │
│   ┌──────────────────────┐        ┌──────────────────────┐               │
│   │   Build & Push Job   │───────▶│     Deploy Job       │               │
│   │   (build-and-push)   │        │     (deploy)         │               │
│   └──────────────────────┘        └──────────────────────┘               │
│                                                                          │
│   Steps:                            Steps:                               │
│   1. Checkout code                  1. Configure AWS Credentials         │
│   2. Setup Node.js                  2. Check ECR Scan Results            │
│   3. Run tests                      3. Update Task Definition            │
│   4. Configure AWS (OIDC)           4. Register New Task Revision        │
│   5. Login to ECR                   5. Update ECS Service                │
│   6. Set Short SHA                                                       │
│   7. Build & Push Docker Image                                           │
│                                                                          │
│   Outputs:                          Inputs:                              │
│   • image_tag (short SHA)           • image_tag (from build job)         │ 
│   • registry (ECR URI)              • registry (from build job)          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Trigger

| Event | Branch | Action |
|-------|--------|--------|
| `push` | `devops` | Triggers full CI/CD pipeline |

```yaml
on:
  push:
    branches: [ "devops" ]
```

> **Note:** Currently triggers only on the `devops` branch. Add `main` or other branches for production deployments.

---

## Permissions

```yaml
permissions:
  id-token: write    # Required for OIDC authentication with AWS
  contents: read     # Required to checkout repository code
```

| Permission | Purpose |
|------------|---------|
| `id-token: write` | Allows GitHub to generate OIDC token for AWS role assumption |
| `contents: read` | Allows actions/checkout to read repository contents |

> **Security:** No `secrets.AWS_ACCESS_KEY_ID` or `secrets.AWS_SECRET_ACCESS_KEY` needed. OIDC eliminates long-lived credentials.

---

## Job 1: Build & Push (`build-and-push`)

### Purpose
Builds the Docker image, runs tests, and pushes to Amazon ECR with an immutable tag.

### Runner
```yaml
runs-on: ubuntu-latest
```

### Outputs
| Output | Description | Example |
|--------|-------------|---------|
| `image_tag` | Short Git SHA (first 7 characters) | `a1b2c3d` |
| `registry` | ECR registry URI | `123456789012.dkr.ecr.ap-southeast-1.amazonaws.com` |

---

### Step-by-Step Breakdown

#### 1. Checkout Code
```yaml
- name: Checkout Code
  uses: actions/checkout@v4
```
Fetches the repository code at the commit that triggered the workflow.

---

#### 2. Setup Node.js
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '24'
    cache: 'npm'
```
| Setting | Value | Purpose |
|---------|-------|---------|
| `node-version` | `24` | Uses Node.js 24 (latest stable) |
| `cache` | `npm` | Caches `node_modules` between runs for faster installs |

---

#### 3. Install Dependencies & Run Tests
```yaml
- run: npm install
- run: npm test --if-present
```
| Command | Behavior |
|---------|----------|
| `npm install` | Installs all dependencies from `package.json` |
| `npm test --if-present` | Runs tests if `test` script exists; exits 0 if missing |

> **Note:** `--if-present` prevents failure if no test script is defined. For production, consider requiring tests.

---

#### 4. Configure AWS Credentials (OIDC)
```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_OIDC_ROLE }}
    aws-region: ap-southeast-1
```
| Input | Source | Description |
|-------|--------|-------------|
| `role-to-assume` | `secrets.AWS_OIDC_ROLE` | ARN of the IAM role created in `oidc.tf` |
| `aws-region` | Hardcoded | AWS region for all subsequent CLI calls |

**How OIDC Works:**
1. GitHub Actions requests an OIDC token from GitHub's token endpoint
2. AWS STS validates the token signature against the registered OIDC provider
3. AWS checks the trust policy (repository name, branch, etc.)
4. If valid, AWS returns temporary credentials (valid for 1 hour by default)

---

#### 5. Login to Amazon ECR
```yaml
- name: Login to Amazon ECR
  id: login-ecr
  uses: aws-actions/amazon-ecr-login@v2
```
Authenticates Docker to the ECR registry. The `id: login-ecr` allows later steps to reference its outputs.

**Output:**
| Output | Description |
|--------|-------------|
| `registry` | Full ECR registry URI (e.g., `123456789012.dkr.ecr.ap-southeast-1.amazonaws.com`) |

---

#### 6. Set Short SHA
```yaml
- name: Set Short SHA
  id: vars
  run: echo "short_sha=$(echo $GITHUB_SHA | cut -c1-7)" >> $GITHUB_OUTPUT
```
Generates a short (7-character) Git commit SHA for tagging the Docker image.

| Variable | Value Example |
|----------|---------------|
| `GITHUB_SHA` | `a1b2c3d4e5f6...` (full 40-char SHA) |
| `short_sha` | `a1b2c3d` |

> **Why short SHA?** Human-readable, unique enough for most projects, and fits nicely in image tags.

---

#### 7. Build and Push to ECR
```yaml
- name: Build and Push to ECR
  env:
    ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
    ECR_REPOSITORY: ${{ secrets.ECR_REPOSITORY }}
  run: |
    docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:${{ steps.vars.outputs.short_sha }} .
    docker push $ECR_REGISTRY/$ECR_REPOSITORY:${{ steps.vars.outputs.short_sha }}
```
| Variable | Source | Example |
|----------|--------|---------|
| `ECR_REGISTRY` | `steps.login-ecr.outputs.registry` | `123456789012.dkr.ecr.ap-southeast-1.amazonaws.com` |
| `ECR_REPOSITORY` | `secrets.ECR_REPOSITORY` | `demo-todo-api` |
| `IMAGE_TAG` | `steps.vars.outputs.short_sha` | `a1b2c3d` |

**Final Image URI:**
```
123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/demo-todo-api:a1b2c3d
```

> **Best Practice:** Using commit SHA instead of `latest` ensures every deployment is traceable and prevents ECS from using cached images.

---

## Job 2: Deploy (`deploy`)

### Purpose
Deploys the newly built image to ECS Fargate by updating the task definition and service.

### Dependency
```yaml
needs: build-and-push
```
This job only runs after `build-and-push` completes successfully. It receives the image tag and registry via `needs.build-and-push.outputs`.

---

### Step-by-Step Breakdown

#### 1. Configure AWS Credentials
Same as build job — authenticates to AWS using OIDC.

---

#### 2. Check ECR Scan Results ⭐
```yaml
- name: Check ECR Scan Results
  run: |
    FINDINGS=$(aws ecr describe-image-scan-findings       --repository-name ${{ secrets.ECR_REPOSITORY }}       --image-id imageTag=${{ needs.build-and-push.outputs.image_tag }}       --query 'imageScanFindings.findingSeverityCounts.CRITICAL' --output text)
    if [ "$FINDINGS" != "None" ] && [ "$FINDINGS" != "0" ]; then
      echo "Critical vulnerabilities found: $FINDINGS"
      exit 1
    fi
```
| Aspect | Description |
|--------|-------------|
| **Command** | `aws ecr describe-image-scan-findings` |
| **Query** | Checks only `CRITICAL` severity findings |
| **Behavior** | Fails the workflow if any critical vulnerabilities exist |

**Security Gate:**
```
Scan Result: CRITICAL = 0  →  Continue deployment
Scan Result: CRITICAL = 3  →  Fail workflow (deployment blocked)
```

> **Important:** This assumes ECR image scanning is enabled (`scan_on_push = true` in `ecr.tf`). The scan may take a few minutes after push.

---

#### 3. Update Task Definition
```yaml
- name: Update Task Definition
  env:
    IMAGE_URI: ${{ needs.build-and-push.outputs.registry }}/${{ secrets.ECR_REPOSITORY }}:${{ needs.build-and-push.outputs.image_tag }}
```

**Step 3a: Fetch Current Task Definition**
```bash
aws ecs describe-task-definition   --task-definition demo-todo-backend   --query taskDefinition > task-def.json
```
Downloads the current ECS task definition JSON from AWS.

**Step 3b: Inject New Image URI**
```bash
cat task-def.json | jq --arg IMAGE "$IMAGE_URI"   '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)'   > new-task-def.json
```
| JQ Operation | Purpose |
|--------------|---------|
| `.containerDefinitions[0].image = $IMAGE` | Updates the container image to the new build |
| `del(...)` | Removes AWS-managed fields that cannot be set during registration |

**Fields Removed:**
| Field | Why Removed |
|-------|-------------|
| `taskDefinitionArn` | Generated by AWS on registration |
| `revision` | Auto-incremented by AWS |
| `status` | Managed by AWS |
| `requiresAttributes` | Computed by AWS |
| `compatibilities` | Computed by AWS |
| `registeredAt` | Timestamp managed by AWS |
| `registeredBy` | IAM identity managed by AWS |

**Step 3c: Register New Task Definition**
```bash
NEW_TASK_DEF=$(aws ecs register-task-definition --cli-input-json file://new-task-def.json)
REVISION=$(echo $NEW_TASK_DEF | jq -r '.taskDefinition.revision')
```
Registers the modified task definition and extracts the new revision number.

**Step 3d: Update ECS Service**
```bash
aws ecs update-service   --cluster demo-todo-cluster   --service demo-todo-service   --task-definition demo-todo-backend:${REVISION}
```
Tells ECS to deploy the new task definition revision. ECS handles:
- Starting new tasks with the new image
- Draining connections from old tasks
- Stopping old tasks once new ones are healthy
- Rolling back if health checks fail (circuit breaker enabled in `ecs.tf`)

---

## Required GitHub Secrets

| Secret | Description | Example |
|--------|-------------|---------|
| `AWS_OIDC_ROLE` | ARN of the IAM role for GitHub Actions OIDC | `arn:aws:iam::123456789012:role/demo-todo-github-oidc-role` |
| `ECR_REPOSITORY` | Name of the ECR repository | `demo-todo-api` |

### How to Set Secrets
```bash
# Using GitHub CLI
gh secret set AWS_OIDC_ROLE --body "arn:aws:iam::123456789012:role/demo-todo-github-oidc-role"
gh secret set ECR_REPOSITORY --body "demo-todo-api"

# Or via GitHub web UI:
# Settings → Secrets and variables → Actions → New repository secret
```

---

## Deployment Flow Summary

```
Developer pushes to 'devops' branch
            │
            ▼
┌─────────────────────────────┐
│  GitHub Actions triggers    │
└─────────────────────────────┘
            │
            ▼
┌─────────────────────────────┐
│  Build & Push Job           │
│  • Checkout code            │
│  • Run npm install + test   │
│  • Build Docker image       │
│  • Tag with short SHA       │
│  • Push to ECR              │
└─────────────────────────────┘
            │
            ▼ (passes image_tag + registry)
┌─────────────────────────────┐
│  Deploy Job                 │
│  • Check ECR scan results   │
│  • Fetch task definition    │
│  • Inject new image URI     │
│  • Register new revision    │
│  • Update ECS service       │
└─────────────────────────────┘
            │
            ▼
┌─────────────────────────────┐
│  ECS Rolling Deployment     │
│  • Start new tasks          │
│  • Health checks pass       │
│  • Drain old tasks          │
│  • Deployment complete      │
└─────────────────────────────┘
```

---

## Security Features

| Feature | Implementation | Benefit |
|---------|----------------|---------|
| **OIDC Authentication** | `configure-aws-credentials` with `role-to-assume` | No long-lived AWS credentials in GitHub |
| **Immutable Image Tags** | Short Git SHA instead of `latest` | Traceable, reproducible deployments |
| **ECR Image Scanning** | `scan_on_push = true` + critical check | Blocks vulnerable images from deploying |
| **Least Privilege IAM** | Separate roles for build and runtime | Limited blast radius if compromised |
| **Private Subnets** | ECS tasks in private subnets | No direct internet exposure |
| **VPC Endpoints** | ECR, Logs, Secrets Manager via PrivateLink | Traffic never leaves AWS network |

---

## Recommendations for Production

### 1. Add Deployment Verification
```yaml
- name: Wait for ECS Service Stability
  run: |
    aws ecs wait services-stable       --cluster demo-todo-cluster       --services demo-todo-service
  timeout-minutes: 10
```

### 2. Add Slack/Teams Notifications
```yaml
- name: Notify on Deployment
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {"text": "Deployment ${{ job.status }}: demo-todo-service"}
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### 3. Add Concurrency Control
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### 4. Parameterize AWS Region
```yaml
aws-region: ${{ secrets.AWS_REGION }}
```

### 5. Add Environment Protection
```yaml
deploy-prod:
  needs: deploy
  environment:
    name: production
    url: https://your-domain.com
  runs-on: ubuntu-latest
  steps:
    # ... production deployment with manual approval
```

### 6. Cache Docker Layers
```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build and Push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ${{ steps.login-ecr.outputs.registry }}/${{ secrets.ECR_REPOSITORY }}:${{ steps.vars.outputs.short_sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `jq: command not found` | `jq` not pre-installed on runner | Add `sudo apt-get install -y jq` step |
| `AccessDenied` on ECR push | IAM role missing ECR permissions | Check `AmazonEC2ContainerRegistryPowerUser` policy |
| `Task definition not found` | Wrong family name | Verify `demo-todo-backend` matches `ecs.tf` |
| ECS tasks not updating | Same image tag | Ensure tag changes (SHA-based tags help) |
| ECR scan check hangs | Scan not complete | Add `sleep 30` or poll for scan completion |
| `Service not stable` timeout | Health checks failing | Check `/health` endpoint and ALB target group |

---

## Related Files

| File | Relationship |
|------|-------------|
| `oidc.tf` | Defines the IAM role and OIDC provider used by this workflow |
| `ecr.tf` | Defines the repository where images are pushed |
| `ecs.tf` | Defines the cluster, service, and task definition being updated |
| `iam-role.tf` | Defines ECS execution and task roles |

---

## License

MIT License — Demo purposes only.