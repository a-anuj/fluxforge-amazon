# Amazon Circular Intelligence (Fluxforce) — AWS Deployment Guide

This guide explains how to deploy the entire application (React Frontend, FastAPI Backend, RDS PostgreSQL Database, and S3 Media Storage) to AWS.

Choose the deployment method that fits your needs:
* **Option 1 (EC2 + Docker Compose)**: Easiest, fastest, and cheapest. Ideal for hackathons, staging, and demo environments.
* **Option 2 (App Runner + S3/CloudFront)**: Scalable, highly available, and fully managed. Ideal for production environments.

---

## Prerequisites
1. **AWS Account**: Access to the AWS Console.
2. **AWS CLI & Git**: Installed on your local machine.
3. **Database**: An active RDS PostgreSQL database (e.g., the one in `backend/.env`).
4. **S3 Bucket**: An active S3 Bucket for media storage (e.g., `flux-force-returns-bucket`).

---

## Option 1: EC2 + Docker Compose (Cost-Efficient & Simple)

This method deploys both the frontend and backend to a single virtual machine (EC2 instance) using Docker Compose. Nginx serves the frontend and reverse-proxies `/api` requests internally.

### Step 1: Launch an EC2 Instance
1. Go to the **AWS EC2 Console** and click **Launch Instance**.
2. **Name**: `fluxforce-web-server`.
3. **AMI**: select **Ubuntu 24.04 LTS** or **Amazon Linux 2023**.
4. **Instance Type**: `t3.micro` (Free Tier eligible) or `t3.small` (recommended, 2GB RAM).
5. **Key Pair**: Select or create a `.pem` key pair for SSH access.
6. **Network Settings**:
   * Check **Allow SSH traffic from**.
   * Check **Allow HTTP traffic from the internet** (Port 80).
   * Check **Allow HTTPS traffic from the internet** (Port 443).
7. Click **Launch Instance**.

### Step 2: Install Docker and Git on EC2
SSH into your EC2 instance (replace `<ip-address>` with your EC2 public IP and `key.pem` with your key file):
```bash
chmod 400 key.pem
ssh -i key.pem ubuntu@<ip-address>
```

Once inside the EC2 terminal, install Docker and Git:
```bash
# Update package lists
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Git and Docker
sudo apt-get install -y git docker.io

# Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Allow your user to run docker commands without sudo
sudo usermod -aG docker ubuntu
newgrp docker

# Install Docker Compose (v2)
sudo apt-get install -y docker-compose-v2
```

### Step 3: Clone and Deploy the Application
1. Clone the repository onto the EC2 instance:
   ```bash
   git clone <your-repository-url> fluxforge-amazon
   cd fluxforge-amazon
   ```
2. Set up the environment variables:
   Create the backend `.env` file:
   ```bash
   nano backend/.env
   ```
   Paste your environment keys:
   ```env
   AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
   AWS_REGION=us-east-1
   AWS_S3_BUCKET_NAME=flux-force-returns-bucket
   DATABASE_URL=postgresql://postgres:postgres@flux-force-db.cjwyqsqs66co.eu-north-1.rds.amazonaws.com:5432/postgres
   ```
   Press `Ctrl+O` and `Enter` to save, then `Ctrl+X` to exit.

3. Spin up the containers using Docker Compose:
   ```bash
   docker compose up -d --build
   ```
4. Verify they are running:
   ```bash
   docker compose ps
   ```
   Your application is now live at `http://<ec2-public-ip>`.

### Step 4: Setup SSL / HTTPS (Recommended)
To map a domain and install a free SSL certificate:
1. Point your domain (e.g., `fluxforce.yourdomain.com`) to the EC2 public IP in your DNS manager (Route 53, GoDaddy, etc.) using an **A Record**.
2. Install Certbot on the EC2 instance:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   ```
3. Run Certbot to generate and configure SSL automatically:
   ```bash
   sudo certbot --nginx -d fluxforce.yourdomain.com
   ```
   *Certbot will configure Nginx automatically to redirect all traffic to secure HTTPS.*

---

## Option 2: AWS App Runner + S3/CloudFront (Serverless & Production-Ready)

This method deploys the FastAPI backend to AWS App Runner (serverless container hosting) and hosts the React frontend statically on Amazon S3 fronted by CloudFront CDN.

```mermaid
graph TD
    Client[Browser Client] -->|HTTPS| CF[Amazon CloudFront CDN]
    CF -->|Static Assets| S3[Amazon S3 Frontend Bucket]
    Client -->|API Requests /api| AR[AWS App Runner Backend]
    AR -->|Queries| RDS[(Amazon RDS PostgreSQL)]
    AR -->|File Uploads| S3Bucket[(Amazon S3 Media Bucket)]
```

### Step 1: Deploy the FastAPI Backend to AWS App Runner
AWS App Runner is the easiest way to run containerized web services.

1. **Option A (Container-based)**:
   * Build and push the backend Docker image to **Amazon ECR (Elastic Container Registry)**:
     ```bash
     aws ecr create-repository --repository-name fluxforce-backend
     aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com
     docker build -t fluxforce-backend ./backend
     docker tag fluxforce-backend:latest <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com/fluxforce-backend:latest
     docker push <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com/fluxforce-backend:latest
     ```
   * Go to **AWS App Runner Console** -> click **Create Service**.
   * Select **Container registry** -> **Amazon ECR** -> Select the image you just pushed.
   * Deployment settings: Select **Automatic** (re-deploys when a new image is pushed).

2. **Option B (GitHub-based)**:
   * Select **Source code repository** -> Connect your GitHub account.
   * Select your repository and branch.
   * Configure deployment:
     * **Runtime**: `Python 3` (or choose custom Dockerfile configuration).
     * **Build command**: `pip install -r requirements.txt`
     * **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
     * **Port**: `8000`

3. **Configure Service Settings**:
   * Add the Environment Variables under **Configuration**:
     * `DATABASE_URL`: `postgresql://postgres:postgres@flux-force-db.cjwyqsqs66co.eu-north-1.rds.amazonaws.com:5432/postgres`
     * `AWS_ACCESS_KEY_ID`: `YOUR_AWS_ACCESS_KEY_ID`
     * `AWS_SECRET_ACCESS_KEY`: `YOUR_AWS_SECRET_ACCESS_KEY`
     * `AWS_REGION`: `us-east-1`
     * `AWS_S3_BUCKET_NAME`: `flux-force-returns-bucket`
   * Click **Create & Deploy**.
   * Once deployed, copy your App Runner service URL (e.g. `https://xxxxxx.us-east-1.awsapprunner.com`).

### Step 2: Build the React Frontend Statically
Now that the backend is live, we build the frontend pointing to the backend's App Runner URL.

1. On your local machine, open the project terminal.
2. Build the production React build with the backend URL:
   ```bash
   cd frontend
   VITE_API_URL=https://xxxxxx.us-east-1.awsapprunner.com/api npm run build
   ```
   *This compiles all files and outputs them to `frontend/dist/`.*

### Step 3: Deploy Frontend to S3 and CloudFront
1. **Create an S3 Bucket**:
   * Go to the **Amazon S3 Console** -> **Create Bucket**.
   * **Name**: e.g., `fluxforce-frontend-app`.
   * Uncheck **Block all public access** (since it will host public web files) and acknowledge the warning.
   * Under **Properties**, enable **Static website hosting**. Set **Index document** and **Error document** to `index.html`.
2. **Upload Static Files**:
   * Upload the entire contents of the `frontend/dist/` folder to the bucket root.
3. **Configure Bucket Policy**:
   * Go to the **Permissions** tab of the bucket and add the following Bucket Policy (replace `fluxforce-frontend-app` with your bucket name):
     ```json
     {
         "Version": "2012-10-17",
         "Statement": [
             {
                 "Sid": "PublicReadGetObject",
                 "Effect": "Allow",
                 "Principal": "*",
                 "Action": "s3:GetObject",
                 "Resource": "arn:aws:s3:::fluxforce-frontend-app/*"
             }
         ]
     }
     ```
4. **Distribute via CloudFront (For HTTPS/SSL & Performance)**:
   * Go to the **CloudFront Console** -> **Create Distribution**.
   * **Origin Domain**: Select your S3 website endpoint (e.g., `fluxforce-frontend-app.s3-website-us-east-1.amazonaws.com`).
   * **Viewer Protocol Policy**: Select **Redirect HTTP to HTTPS**.
   * Under **Custom SSL Certificate**: Associate your domain SSL certificate if you are mapping a custom domain.
   * Click **Create Distribution**.
   * Your frontend is now accessible globally via the CloudFront distribution domain name (e.g. `https://dyxxxxx.cloudfront.net`) with full HTTPS SSL support!
