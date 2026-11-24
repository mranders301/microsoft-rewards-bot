import type { AxiosRequestConfig } from 'axios'
import { randomBytes } from 'crypto'
import { Workers } from '../../Workers'

export class ReadToEarn extends Workers {
    public async doReadToEarn(): Promise<number> {
        if (!this.bot.accessToken) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'READ-TO-EARN',
                'Skipping: App access token not available, this activity requires it!'
            )
            return 0
        }

        if (this.bot.appDapiBlocked) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'READ-TO-EARN',
                'Skipping: app activities are blocked for this account (previous request failed with 400/417)'
            )
            return 0
        }

        const delayMin = this.bot.config.searchSettings.readDelay.min
        const delayMax = this.bot.config.searchSettings.readDelay.max
        const startBalance = +(this.bot.userData.currentPoints || 0);
        (this as any)._zeroGainCount = 0;

        this.bot.logger.info(
            this.bot.isMobile,
            'READ-TO-EARN',
            `Starting Read to Earn | geo=${this.bot.userData.geoLocale} | delayRange=${delayMin}-${delayMax} | currentPoints=${startBalance}`
        )

        try {
            const jsonData = {
                amount: 1,
                id: '1',
                type: 101,
                attributes: {
                    offerid: 'ENUS_readarticle3_30points'
                },
                country: this.bot.userData.geoLocale.toLowerCase()
            }

            const articleCount = 10
            let totalGained = 0
            let articlesRead = 0
            let oldBalance = startBalance
            let currentVariant = 101

            for (let i = 0; i < articleCount; ++i) {
                jsonData.id = randomBytes(64).toString('hex')
                jsonData.type = currentVariant

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `Submitting Read to Earn activity | article=${i + 1}/${articleCount} | type=${currentVariant} | id=${jsonData.id} | country=${jsonData.country}`
                )

                const appHeaders = await this.bot.browser.useragent.getBingAppHeaders(true)

                const request: AxiosRequestConfig = {
                    url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                    method: 'POST',
                    headers: {
                        ...appHeaders,
                        Authorization: `Bearer ${this.bot.accessToken}`,
                        'X-Rewards-Country': this.bot.userData.geoLocale.toLowerCase(),
                        'X-Rewards-Language': this.bot.userData.langCode || 'en'
                    },
                    data: JSON.stringify(jsonData)
                }

                try {
                    const response = await this.bot.axios.request(request)

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'READ-TO-EARN',
                        `Received Read to Earn response | article=${i + 1}/${articleCount} | type=${currentVariant} | status=${response?.status ?? 'unknown'}`
                    )

                    const newBalance = parseInt(String(response?.data?.response?.balance ?? oldBalance), 10)
                    const gainedPoints = newBalance - oldBalance

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'READ-TO-EARN',
                        `Balance delta after article | article=${i + 1}/${articleCount} | oldBalance=${oldBalance} | newBalance=${newBalance} | gainedPoints=${gainedPoints}`
                    )

                    if (gainedPoints <= 0) {
                        // [v61.1.46] Point Lag Protection: MS sometimes lags reporting. 
                        // Retry up to 3 articles with 0 gain before hard-quitting.
                        const zeroGainCount = (this as any)._zeroGainCount || 0
                        if (zeroGainCount < 3) {
                            (this as any)._zeroGainCount = zeroGainCount + 1
                            this.bot.logger.warn(
                                this.bot.isMobile,
                                'READ-TO-EARN',
                                `No points gained for article ${i + 1}. Potentially lagged. (Strike ${(this as any)._zeroGainCount}/3)`
                            )
                            await this.bot.utils.wait(2500)
                            continue // Try next article
                        }
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'READ-TO-EARN',
                            `No points gained after 3 attempts, stopping Read to Earn | article=${i + 1}/${articleCount} | status=${response.status}`
                        )
                        break
                    }
                    (this as any)._zeroGainCount = 0 // Reset on success

                    // Update point tracking
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints
                    totalGained += gainedPoints
                    articlesRead = i + 1
                    oldBalance = newBalance

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'READ-TO-EARN',
                        `[+${gainedPoints} Points] Read article ${i + 1}/${articleCount} | New Total: ${newBalance} | status=${response.status}`,
                        'green'
                    )
                    this.bot.updateDashboard({
                        status: 'Running'
                    })

                    // Wait random delay between articles
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'READ-TO-EARN',
                        `Waiting between articles | article=${i + 1}/${articleCount} | delayRange=${delayMin}-${delayMax}`
                    )

                    const readDelay = this.bot.utils.randomDelay(delayMin, delayMax)
                    await this.bot.utils.wait(readDelay)
                } catch (error) {
                    const status = (error as any)?.response?.status
                    if ((status === 400 || status === 417) && currentVariant === 101) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'READ-TO-EARN',
                            `Type 101 failed with status ${status}. Falling back to type 103 for remaining articles.`
                        )
                        currentVariant = 103
                        i-- // Retry this article index
                        continue
                    }

                    if (status === 400 || status === 417) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'READ-TO-EARN',
                            `App activities blocked by server (status=${status}); skipping remaining ReadToEarn for this account`
                        )
                        this.bot.appDapiBlocked = true
                        break
                    }

                    this.bot.logger.error(
                        this.bot.isMobile,
                        'READ-TO-EARN',
                        `Error during Read to Earn article ${i + 1} | message=${error instanceof Error ? error.message : String(error)}`
                    )
                    break
                }
            }

            const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance)

            this.bot.logger.info(
                this.bot.isMobile,
                'READ-TO-EARN',
                `Completed Read to Earn | articlesRead=${articlesRead} | totalGained=${totalGained} | startBalance=${startBalance} | finalBalance=${finalBalance}`
            )
            return totalGained
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'READ-TO-EARN',
                `Fatal Error during Read to Earn | message=${error instanceof Error ? error.message : String(error)}`
            )
            return 0
        }
    }
}
