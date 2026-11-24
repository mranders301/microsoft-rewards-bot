import type { AxiosRequestConfig } from 'axios'
import { randomUUID } from 'crypto'
import type { Promotion } from '../../../interface/AppDashBoardData'
import { Workers } from '../../Workers'

export class AppReward extends Workers {
    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doAppReward(promotion: Promotion) {
        if (!this.bot.accessToken) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'APP-REWARD',
                'Skipping: App access token not available, this activity requires it!'
            )
            return
        }

        const offerId = promotion.attributes['offerid'] || ''
        this.oldBalance = this.bot.userData.currentPoints

        this.bot.logger.info(
            this.bot.isMobile,
            'APP-REWARD',
            `Starting AppReward | offerId=${offerId} | country=${this.bot.userData.geoLocale} | oldBalance=${this.oldBalance}`
        )

        let success = false
        try {
            success = await this.submitAppReward(offerId, 101)
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'APP-REWARD',
                `Type 101 failed with status ${(error as any)?.response?.status ?? 'unknown'}. Falling back to type 103.`
            )
        }

        if (!success) {
            try {
                success = await this.submitAppReward(offerId, 103)
            } catch (error) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'APP-REWARD',
                    `Type 103 failed with status ${(error as any)?.response?.status ?? 'unknown'}`
                )
            }
        }

        if (!success) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'APP-REWARD',
                `AppReward could not be claimed for offerId=${offerId} with variants (101, 103). Continuing to next promotion.`
            )
        }

        this.bot.logger.debug(this.bot.isMobile, 'APP-REWARD', `Waiting after AppReward | offerId=${offerId}`)
        await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))

        this.bot.logger.info(
            this.bot.isMobile,
            'APP-REWARD',
            `Finished AppReward | offerId=${offerId} | finalBalance=${this.bot.userData.currentPoints}`
        )
    }

    private async submitAppReward(offerId: string, variant: number): Promise<boolean> {
        const jsonData = {
            id: randomUUID(),
            amount: 1,
            type: variant,
            attributes: {
                offerid: offerId
            },
            country: this.bot.userData.geoLocale.toLowerCase()
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'APP-REWARD',
            `Prepared activity payload | offerId=${offerId} | id=${jsonData.id} | amount=${jsonData.amount} | type=${jsonData.type} | country=${jsonData.country}`
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

        this.bot.logger.debug(
            this.bot.isMobile,
            'APP-REWARD',
            `Sending activity request | offerId=${offerId} | url=${request.url}`
        )

        const response = await this.bot.axios.request(request)

        this.bot.logger.debug(
            this.bot.isMobile,
            'APP-REWARD',
            `Received activity response | offerId=${offerId} | status=${response.status}`
        )

        const newBalance = Number(response?.data?.response?.balance ?? this.oldBalance)
        this.gainedPoints = newBalance > this.oldBalance ? newBalance - this.oldBalance : 0
        this.oldBalance = newBalance

        this.bot.logger.debug(
            this.bot.isMobile,
            'APP-REWARD',
            `Balance delta after AppReward | type=${variant} | offerId=${offerId} | oldBalance=${this.oldBalance} | newBalance=${newBalance} | gainedPoints=${this.gainedPoints}`
        )

        if (this.gainedPoints > 0) {
            this.bot.userData.currentPoints = newBalance
            this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

            this.bot.logger.info(
                this.bot.isMobile,
                'APP-REWARD',
                `[+${this.gainedPoints} Points] Completed AppReward (type=${variant}) | New Total: ${newBalance} | offerId=${offerId}`,
                'green'
            )
            this.bot.updateDashboard({
                status: 'Running' // Trigger update with new points
            })
            return true
        } else {
            this.bot.logger.warn(
                this.bot.isMobile,
                'APP-REWARD',
                `Completed AppReward with no points | type=${variant} | offerId=${offerId} | oldBalance=${this.oldBalance} | newBalance=${newBalance}`
            )
            return false
        }
    }
}
