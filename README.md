# Lazy Signal Fire 🔥

An automated blockchain transaction sender that periodically calls the `fire()` function on a smart contract because I'm too lazy and don't want to lose my streak (has no value btw).

## Security Features

- **Strong Encryption**: AES-256-GCM with random salt, IV, and authentication tag
- **Secure Storage**: Private key never stored in plain text
- **File Permissions**: Encrypted key file has restricted permissions
- **Password Masking**: Private key input is hidden during entry
- **Gas Optimization**: Smart gas limit capping to prevent overpayment

## Setup

1. Clone this repository:
   ```
   git clone https://github.com/komiwalnut/lazy-signal-fire.git
   cd lazy-signal-fire
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

3. Create a `.env` file based on the example:
   ```
   cp .env.example .env
   ```

4. Edit the `.env` file with your settings:
   - Generate a secure encryption key with:
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Set your dRPC endpoint (follow instruction in `.env` file you just created)

## Usage

### Testing

To test the script:

1. Install Node.js and pnpm
2. Run in test mode to verify everything works without sending transactions:
   ```
   pnpm run test
   ```

### Running Manually

```
pnpm run dev
```

On first run, you'll be prompted to enter your private key, which will be encrypted and stored securely.

### Production Deployment

Build and run:

```
pnpm build
pnpm start
```

### Setting Up a Cron Job

To run the script automatically every 13 hours in UTC time:

1. Find your project's absolute path:
   ```
   pwd
   ```
   This will display something like `/home/ec2-user/lazy-signal-fire`

2. Find the absolute path to your pnpm executable:
   ```
   which pnpm
   ```
   This will display something like `/usr/local/bin/pnpm`

3. Open the crontab editor:
   ```
   crontab -e
   ```

4. Add the following line (replace with your actual paths from steps 1 and 2):
   ```
   0 */13 * * * cd /path/to/lazy-signal-fire && /path/to/pnpm start >> /path/to/lazy-signal-fire/cron.log 2>&1
   ```
   Example:
   ```
   0 */13 * * * cd /home/ec2-user/lazy-signal-fire && /usr/local/bin/pnpm start >> /home/ec2-user/lazy-signal-fire/cron.log 2>&1
   ```
   This will run the script at 00:00 UTC and 13:00 UTC every day (midnight and 1 PM UTC).

5. Save and exit the editor:
   - For nano: Press Ctrl+O, then Enter, then Ctrl+X
   - For vim: Press Esc, then type `:wq` and hit Enter

6. Verify your cron job was added:
   ```
   crontab -l
   ```

This will run the script at minute 0 of every 13th hour (e.g., 12:00 AM, 1:00 PM) and save all output to `cron.log` in your project directory.
