import type { AxiosRequestConfig } from 'axios'
import type { Page } from 'patchright'
import type { BasePromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class UrlReward extends Workers {
    private cookieHeader: string = ''
    private fingerprintHeader: { [x: string]: string } = {}
    private gainedPoints: number = 0
    private oldBalance: number = 0 // Set at start of each doUrlReward() call

    public async doUrlReward(promotion: BasePromotion, page?: Page) {
        // Bug fix: capture current balance at the START of this call, or fetch baseline if 0
        this.oldBalance = this.bot.userData.currentPoints > 0 
            ? this.bot.userData.currentPoints 
            : (await this.bot.browser.func.getCurrentPoints(page).catch(() => 0))

        let success = false
        const offerId = promotion.offerId

        // A. Attempt completion via direct API call first if hash is present
        if (promotion.hash) {
            this.bot.logger.info(
                this.bot.isMobile,
                'URL-REWARD',
                `Starting UrlReward via API | offerId=${offerId} | geo=${this.bot.userData.geoLocale} | oldBalance=${this.oldBalance}`
            )

            try {
                this.cookieHeader = this.bot.browser.func.buildCookieHeader(
                    this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
                    ['bing.com', 'live.com', 'microsoftonline.com']
                )

                const fingerprintHeaders = { ...(this.bot.fingerprint?.headers ?? {}) }
                delete fingerprintHeaders['Cookie']
                delete fingerprintHeaders['cookie']
                this.fingerprintHeader = fingerprintHeaders

                const timeZoneOffset = this.bot.utils.getLocaleSettings(this.bot.userData.geoLocale).timezoneOffset

                const formData = new URLSearchParams({
                    id: offerId,
                    hash: promotion.hash,
                    timeZone: timeZoneOffset,
                    activityAmount: '1',
                    dbs: '0',
                    form: '',
                    type: '',
                    __RequestVerificationToken: this.bot.requestToken || ''
                })

                const request: AxiosRequestConfig = {
                    url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
                    method: 'POST',
                    headers: {
                        ...(this.bot.fingerprint?.headers ?? {}),
                        Cookie: this.cookieHeader,
                        Referer: 'https://rewards.bing.com/',
                        Origin: 'https://rewards.bing.com'
                    },
                    data: formData
                }

                let responseStatus: number | null = null

                try {
                    const response = await this.bot.axios.request(request, false)
                    responseStatus = response.status
                } catch (axiosError) {
                    const errMsg = axiosError instanceof Error ? axiosError.message : String(axiosError)
                    const isNetwork = errMsg.includes('ECONNRESET') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED') || errMsg.includes('socket') || errMsg.includes('stream has been aborted') || errMsg.includes('fetch failed') || errMsg.includes('ERR_CONNECT_FAIL') || errMsg.includes('ERR_PROXY_CONNECTION_FAILED') || errMsg.includes('492')

                    if (isNetwork) {
                        const fetchResult = await this.bot.browser.func.browserRequest({
                            url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
                            method: 'POST',
                            data: formData.toString(),
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'X-Requested-With': 'XMLHttpRequest',
                                'Referer': 'https://rewards.bing.com/',
                                'Origin': 'https://rewards.bing.com'
                            }
                        }).catch(() => null)

                        if (fetchResult) {
                            responseStatus = fetchResult.status
                        }
                    }
                }

                await this.bot.utils.wait(2000) // Small wait for point server to update
                const newBalance = await this.bot.browser.func.getCurrentPoints(page).catch(() => 0)
                this.gainedPoints = (newBalance > 0 && this.oldBalance > 0) ? (newBalance - this.oldBalance) : 0

                if (this.gainedPoints > 0) {
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                    await this.bot.updateDashboard({
                        currentBalance: newBalance,
                        pointsGained: this.bot.userData.gainedPoints
                    })

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `[+${this.gainedPoints} Points] Completed UrlReward (API) | New Total: ${newBalance} | offerId=${offerId}`,
                        'green'
                    )
                    success = true
                }
            } catch (error) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `API submission failed for offerId=${offerId}, falling back to browser navigation`
                )
            }
        }

        // B. Fallback to Browser Navigation & Native Click if API failed or returned 0 points
        if (!success) {
            if (page && promotion.destinationUrl) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Completing activity via browser navigation | title="${promotion.title}" | offerId=${offerId}`
                )

                // 1. If hash exists, attempt in-page reportactivity fetch using active session cookies
                if (promotion.hash) {
                    await page.evaluate(async ({ id, hash }) => {
                        try {
                            const fd = new URLSearchParams({
                                id: id,
                                hash: hash,
                                timeZone: String(new Date().getTimezoneOffset()),
                                activityAmount: '1',
                                dbs: '0',
                                form: '',
                                type: ''
                            })
                            await fetch('https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                    'X-Requested-With': 'XMLHttpRequest'
                                },
                                body: fd.toString(),
                                credentials: 'include'
                            })
                        } catch { }
                    }, { id: offerId, hash: promotion.hash }).catch(() => { })
                }

                // 2. Attempt native DOM tile click if element exists on active page
                const clicked = await page.evaluate((id) => {
                    const sel = `[data-bi-id="${id}"], [data-offerid="${id}"], a[href*="${id}"]`
                    const el = document.querySelector(sel) as HTMLElement
                    if (el) { el.click(); return true }
                    return false
                }, offerId).catch(() => false)

                if (clicked) {
                    this.bot.logger.info(this.bot.isMobile, 'URL-REWARD', `Clicked tile element in DOM for offerId=${offerId}`)
                    await this.bot.utils.wait(3000)
                }

                // 3. Navigate via Microsoft's /redirect endpoint if hash exists, or destinationUrl
                const targetUrl = (promotion.destinationUrl.includes('/redirect') || !promotion.hash)
                    ? promotion.destinationUrl
                    : `https://rewards.bing.com/redirect?url=${encodeURIComponent(promotion.destinationUrl)}&hash=${promotion.hash}&id=${offerId}`

                await this.bot.browser.utils.safeGoto(page, targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => { })
                await this.bot.utils.wait(4000)

                const newBalance = await this.bot.browser.func.getCurrentPoints(page).catch(() => 0)
                this.gainedPoints = (newBalance > 0 && this.oldBalance > 0) ? (newBalance - this.oldBalance) : 0

                if (this.gainedPoints > 0) {
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints
                    await this.bot.updateDashboard({ currentBalance: newBalance, pointsGained: this.bot.userData.gainedPoints })
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `[+${this.gainedPoints} Points] Verified UrlReward complete (Browser) | New Total: ${newBalance} | title="${promotion.title}"`,
                        'green'
                    )
                } else {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `Completed navigation for "${promotion.title}" | Server balance unchanged (${this.oldBalance} pts)`
                    )
                }
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Skipped activity: offerId=${offerId} has no browser page or target URL`
                )
            }
        }

        // Post activity wait
        await this.bot.utils.wait(this.bot.utils.randomDelay(4000, 8000))
    }
}
