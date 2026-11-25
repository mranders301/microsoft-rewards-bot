# Microsoft Rewards Bot

A browser automation project for Microsoft Rewards, built with TypeScript.

[Watch the full recording](docs/showcase-redacted.mp4) · [Installation](#installation) · [FAQ](#faq)

https://github.com/user-attachments/assets/acff9a66-8eeb-4218-82ae-2782e3d2e932



*This full recording shows an earlier version. It is cropped and muted to protect account details. The current build has not been tested on a live account.*

## What it does

- Runs desktop and mobile Bing searches.
- Tries daily tasks and other available activities.
- Shows progress in the terminal.
- Lets you choose which activities to run.

Activities depend on your account and region. Microsoft can change them at any time.

> **Account risk:** Microsoft does not allow automated searches for Rewards points. Searches may earn nothing, and accounts can be restricted. [Microsoft's rules](https://support.microsoft.com/en-us/accounts-billing/rewards/limiting-your-searches-in-microsoft-rewards).

## Installation

**1. Install [Node.js 24 or newer](https://nodejs.org/).**

**2. Open a terminal in the project folder and run:**

```sh
npm ci
npm run install:browser
npm run build
```

**3. Set up your files.**

Copy `config.example.json` and name the copy `config.json`. Create a file named `.env` in the project folder and add:

```dotenv
ACCOUNT_1_EMAIL=your@email.com
ACCOUNT_1_PASSWORD=your_password
```

**4. Start the bot.**

```sh
npm start
```

Keep your `.env`, config and browser sessions private. They are excluded from Git. For more settings, see the [original project](https://github.com/TheNetsky/Microsoft-Rewards-Script).

## FAQ

**How many points can I earn?**

There is no guaranteed amount. Offers and daily limits vary by country and account. Automated searches may not earn points. [Microsoft's points guide](https://support.microsoft.com/en-us/accounts-billing/rewards/how-to-earn-microsoft-rewards-points).

**Does the video show this exact version?**

No. It shows an earlier version. This build has passed a TypeScript build, but has not been tested with a live account.

**What is `recovered-source`?**

It contains files recovered from an earlier project. They are kept for reference and are not part of the build.

## Credits

This project is based on [TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script). Licensed under [GPL-3.0-or-later](LICENSE).
