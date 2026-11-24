import type { Page } from 'patchright'
import { Workers } from '../../Workers'

import type { ParsedOffer, StreakState } from '../../../browser/ReactFunc'
import type { DashboardData } from '../../../interface/DashboardData'

const VISUAL_SEARCH_ACTIVATION_OFFER = 'visualsearch_streak_activation_v2'

const VERIFIED_ACTIVITY_TYPES = new Map<string, number>([
    ['ww_visualsearch_summerjuly26_activation_banner', 11],
    ['visualsearch_streak_activation_v2', 11]
])

type ActivationResult = 'activated' | 'already-active' | 'absent' | 'failed'

interface ActivationMetadata {
    activityType: number
    activityTypeSource: 'react' | 'dashboard' | 'verified-fallback'
    isPromotional: boolean
}

export class VisualSearch extends Workers {
    public async doVisualSearch(data: DashboardData, page?: Page): Promise<number> {
        if (this.bot.isMobile) {
            this.bot.logger.debug(this.bot.isMobile, 'VISUAL-SEARCH', 'Skipping on mobile - desktop-only activity')
            return 0
        }

        const streak = this.findStreak()
        this.logStreakState(streak)

        if (streak?.isCurrentDayCompleted) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Already completed today | visualSearchStreak=${streak.completedDays}/${streak.totalDays}`,
                'green'
            )
            return 0
        }

        const activation = await this.activate(data)
        const available = !!streak || activation === 'activated' || activation === 'already-active'
        if (!available) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Visual search streak offer not active, executing direct Bing Image Visual Search...'
            )
        }

        // Perform actual Visual Search on Bing Images if desktop browser page is available
        if (page) {
            try {
                this.bot.logger.info(this.bot.isMobile, 'IMAGE-SEARCH', 'Executing Bing Visual Search (Search-by-Image)...', 'cyan')
                await this.bot.browser.utils.safeGoto(page, 'https://www.bing.com/images/search?view=detailv2&iss=sbi&q=trending+nature+wallpaper', { waitUntil: 'domcontentloaded' }).catch(() => {})
                await this.bot.utils.wait(2500)
                await page.evaluate(() => {
                    const el = document.querySelector('.vs_sample_img, a[data-bi-id*="visualsearch"], .sbi_sample_thumb, .sample-item') as HTMLElement
                    if (el && typeof el.click === 'function' && !el.classList?.contains('camera_icon')) el.click()
                }).catch(() => {})
                await this.bot.utils.wait(2000)

                // Ensure page dismisses any camera popup and returns cleanly
                if (page.url().includes('/camera')) {
                    await page.keyboard.press('Escape').catch(() => {})
                    await this.bot.browser.utils.safeGoto(page, 'https://rewards.bing.com/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {})
                }
                this.bot.logger.info(this.bot.isMobile, 'IMAGE-SEARCH', 'Bing Visual Search completed successfully', 'green')
            } catch (err: any) {
                this.bot.logger.debug(this.bot.isMobile, 'VISUAL-SEARCH', `Visual Search action notice: ${err?.message}`)
            }
        }

        return 0
    }

    private findStreak(streaks?: StreakState[]): StreakState | undefined {
        const source = streaks ?? this.bot.reactSnapshot?.streaks ?? []
        return source.find(s => /visual.?search/i.test(s.partner))
    }

    private logStreakState(streak: StreakState | undefined): void {
        if (!streak) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'No visual-search streak in the snapshot - falling back to the activation offer'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Streak state | partner="${streak.partner}" | enabled=${streak.isEnabled} | dayCompleted=${streak.isCurrentDayCompleted} | days=${streak.completedDays}/${streak.totalDays} | currentDay=${streak.currentDay}`
        )
    }

    private async activate(data: DashboardData): Promise<ActivationResult> {
        const offer = this.findActivationOffer()
        if (!offer) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'No visual-search activation offer present on the dashboard'
            )
            return 'absent'
        }

        if (!offer.reportable) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Visual search already active (or not activatable) | offerId=${offer.offerId}`,
                'green'
            )
            return 'already-active'
        }

        const actionId = this.bot.nextActions?.reportActivity
        if (!actionId) return 'failed'

        const metadata = this.resolveActivationMetadata(offer)
        if (!metadata) return 'failed'

        const timezoneOffset = this.bot.utils.getLocaleSettings(this.bot.userData.geoLocale).timezoneOffset

        try {
            const { acknowledged } = await this.bot.browser.func.reportServerAction(actionId, [
                offer.hash,
                metadata.activityType,
                {
                    offerid: offer.offerId,
                    isPromotional: metadata.isPromotional ? 'true' : '$undefined',
                    timezoneOffset
                }
            ])

            if (acknowledged) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Activated visual search | offerId=${offer.offerId}`,
                    'green'
                )
                return 'activated'
            }
            return 'failed'
        } catch {
            return 'failed'
        }
    }

    private resolveActivationMetadata(offer: ParsedOffer): ActivationMetadata | null {
        if (offer.activityType !== null) {
            return {
                activityType: offer.activityType,
                activityTypeSource: 'react',
                isPromotional: offer.isPromotional
            }
        }

        const verifiedFallback = VERIFIED_ACTIVITY_TYPES.get(offer.offerId.toLowerCase())
        if (verifiedFallback !== undefined) {
            return {
                activityType: verifiedFallback,
                activityTypeSource: 'verified-fallback',
                isPromotional: offer.isPromotional
            }
        }

        return null
    }

    private findActivationOffer(): ParsedOffer | null {
        const offers = this.bot.reactSnapshot?.offers ?? []
        const exact = offers.find(o => o.offerId === VISUAL_SEARCH_ACTIVATION_OFFER)
        if (exact) return exact

        return (
            offers.find(o => {
                const id = o.offerId.toLowerCase()
                return id.includes('visualsearch') && id.includes('activation')
            }) ?? null
        )
    }
}
