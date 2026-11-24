import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../index'
import type {
    DashboardData,
    PunchCard,
    BasePromotion,
    FindClippyPromotion,
    PurplePromotionalItem
} from '../interface/DashboardData'
import type { AppDashboardData } from '../interface/AppDashBoardData'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    public async doDailySet(data: DashboardData, page: Page): Promise<number> {
        const todayKey = this.bot.utils.getFormattedDate()
        const todayData = data.dailySetPromotions?.[todayKey] || Object.values(data.dailySetPromotions || {}).flat()

        const activitiesUncompleted = todayData?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have already been completed')
            return 0
        }

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'Started solving "Daily Set" items')

        const points = await this.solveActivities(activitiesUncompleted, page)

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have been completed')
        return points
    }

    public async doMorePromotions(data: DashboardData, page: Page): Promise<number> {
        const morePromotions: BasePromotion[] = [
            ...new Map(
                [...(data.morePromotions ?? []), ...(data.morePromotionsWithoutPromotionalItems ?? [])]
                    .filter(Boolean)
                    .map(p => [p.offerId, p as BasePromotion] as const)
            ).values()
        ]

        const activitiesUncompleted: BasePromotion[] =
            morePromotions?.filter(x => {
                if (x.complete) return false
                if (x.pointProgressMax <= 0) return false
                if (x.exclusiveLockedFeatureStatus === 'locked') return false
                if (!x.promotionType) return false
                const oid = (x.offerId ?? '').toLowerCase()
                if (oid.includes('pcparent') || oid.includes('pcchild')) return false

                return true
            }) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'MORE-PROMOTIONS',
                'All "More Promotion" items have already been completed'
            )
            return 0
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'MORE-PROMOTIONS',
            `Started solving ${activitiesUncompleted.length} "More Promotions" items`
        )

        const points = await this.solveActivities(activitiesUncompleted, page)

        this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have been completed')
        return points
    }

    public async doAppPromotions(data: AppDashboardData): Promise<number> {
        let totalPoints = 0
        if (this.bot.appDapiBlocked) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'APP-PROMOTIONS',
                'Skipping: app activities are blocked for this account (previous request failed with 400/417)'
            )
            return 0
        }

        if (!data?.response?.promotions) {
            this.bot.logger.info(
                this.bot.isMobile,
                'APP-PROMOTIONS',
                'All "App Promotions" items have already been completed'
            )
            return 0
        }

        const appRewards = (data.response.promotions ?? []).filter(x => {
            if (x.attributes['complete']?.toLowerCase() !== 'false') return false
            if (!x.attributes['offerid']) return false
            if (!x.attributes['type']) return false
            if (x.attributes['type'] !== 'sapphire') return false

            return true
        })

        if (!appRewards.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'APP-PROMOTIONS',
                'All "App Promotions" items have already been completed'
            )
            return 0
        }

        for (const reward of appRewards) {
            totalPoints += 5 // Most appRewards are 5 points
            await this.bot.activities.doAppReward(reward)
            if (this.bot.appDapiBlocked) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'APP-PROMOTIONS',
                    'Stopping app promotions early: app activities are blocked (400/417)'
                )
                break
            }
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
        }

        this.bot.logger.info(this.bot.isMobile, 'APP-PROMOTIONS', 'All "App Promotions" items have been completed')
        return totalPoints
    }

    public async doSpecialPromotions(data: DashboardData) {
        const specialPromotions: PurplePromotionalItem[] = [
            ...new Map(
                [...(data.promotionalItems ?? [])]
                    .filter(Boolean)
                    .map(p => [p.offerId, p as PurplePromotionalItem] as const)
            ).values()
        ]

        const supportedPromotions = ['ww_banner_optin_2x']

        const specialPromotionsUncompleted: PurplePromotionalItem[] =
            specialPromotions?.filter(x => {
                if (x.complete) return false
                if (x.exclusiveLockedFeatureStatus === 'locked') return false
                if (!x.promotionType) return false

                const offerId = (x.offerId ?? '').toLowerCase()
                return supportedPromotions.some(s => offerId.includes(s))
            }) ?? []

        for (const activity of specialPromotionsUncompleted) {
            try {
                const type = activity.promotionType?.toLowerCase() ?? ''
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = (activity as PurplePromotionalItem).offerId

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SPECIAL-ACTIVITY',
                    `Processing activity | title="${activity.title}" | offerId=${offerId} | type=${type}"`
                )

                switch (type) {
                    // UrlReward & WelcomeTour
                    case 'welcometour':
                    case 'urlreward': {
                        // Special "Double Search Points" activation
                        if (name.includes('ww_banner_optin_2x')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "Double Search Points" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doDoubleSearchPoints(activity)
                        }
                        break
                    }

                    // Unsupported types
                    default: {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'SPECIAL-ACTIVITY',
                            `Skipped activity "${activity.title}" | offerId=${offerId} | Reason: Unsupported type "${activity.promotionType}"`
                        )
                        break
                    }
                }
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'SPECIAL-ACTIVITY',
                    `Error while solving activity "${activity.title}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }

        this.bot.logger.info(this.bot.isMobile, 'SPECIAL-ACTIVITY', 'All "Special Activites" items have been completed')
    }

    public async doPunchCards(data: DashboardData, page: Page): Promise<number> {
        const punchCards: PunchCard[] =
            (data.punchCards ?? []).filter(x => !x.parentPromotion?.complete && x.parentPromotion?.pointProgressMax > 0) ?? []

        const punchCardActivities = punchCards.flatMap(x => x.childPromotions)

        const activitiesUncompleted: BasePromotion[] =
            punchCardActivities?.filter(x => {
                if (x.complete) return false
                if (x.exclusiveLockedFeatureStatus === 'locked') return false
                if (!x.promotionType) return false

                return true
            }) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'All "Punch Card" items have already been completed')
            return 0
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Started solving ${activitiesUncompleted.length} "Punch Card" items`
        )

        const points = await this.solveActivities(activitiesUncompleted, page)

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'All "Punch Card" items have been completed')
        return points
    }

    private async solveActivities(activities: BasePromotion[], page: Page, punchCard?: PunchCard): Promise<number> {
        // Prioritize non-search activities (UrlReward that aren't exploreonbing, Quiz, etc.)
        // This gives users "instant points" at the start of the account run.
        activities.sort((a, b) => {
            const aIsSearch = (a.name?.toLowerCase() || '').includes('exploreonbing')
            const bIsSearch = (b.name?.toLowerCase() || '').includes('exploreonbing')

            if (aIsSearch && !bIsSearch) return 1
            if (!aIsSearch && bIsSearch) return -1
            return 0
        })

        let totalPoints = 0
        for (const activity of activities) {
            try {
                const type = activity.promotionType?.toLowerCase() ?? ''
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = (activity as BasePromotion).offerId
                const destinationUrl = activity.destinationUrl?.toLowerCase() ?? ''

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Processing activity | title="${activity.title}" | offerId=${offerId} | type=${type} | punchCard="${punchCard?.parentPromotion?.title ?? 'none'}"`
                )

                const sessionGainedBefore = this.bot.userData.gainedPoints || 0

                switch (type) {
                    // Quiz-like activities (Poll / regular quiz variants)
                    case 'quiz': {
                        const basePromotion = activity as BasePromotion

                        // Poll (usually 10 points, pollscenarioid in URL)
                        if (activity.pointProgressMax === 10 && destinationUrl.includes('pollscenarioid')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "Poll" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doUrlReward(basePromotion, page)
                            break
                        }

                        // All other quizzes handled via Quiz API
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Found activity type "Quiz" | title="${activity.title}" | offerId=${offerId}`
                        )

                        await this.bot.activities.doQuiz(basePromotion)
                        break
                    }

                    // UrlReward & WelcomeTour
                    case 'welcometour':
                    case 'urlreward': {
                        const basePromotion = activity as BasePromotion

                        // Search on Bing are subtypes of "urlreward"
                        const isSearchTask =
                            name.includes('exploreonbing') ||
                            name.includes('searchonbing') ||
                            (activity.description?.toLowerCase() || '').includes('search on bing') ||
                            (activity.title?.toLowerCase() || '').includes('explore on bing')

                        if (isSearchTask) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "SearchOnBing" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doSearchOnBing(basePromotion, page)
                        } else {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "${type === 'welcometour' ? 'WelcomeTour' : 'UrlReward'}" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doUrlReward(basePromotion, page)
                        }
                        break
                    }

                    // Find Clippy specific promotion type
                    case 'findclippy': {
                        const clippyPromotion = activity as unknown as FindClippyPromotion

                        this.bot.logger.info(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Found activity type "FindClippy" | title="${activity.title}" | offerId=${offerId}`
                        )

                        await this.bot.activities.doFindClippy(clippyPromotion)
                        break
                    }

                    // Unsupported types
                    default: {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Skipped activity "${activity.title}" | offerId=${offerId} | Reason: Unsupported type "${activity.promotionType}"`
                        )
                        break
                    }
                }

                // [v61.1.78] Track actual points gained instead of fake pointProgressMax
                const sessionGainedAfter = this.bot.userData.gainedPoints || 0
                const gained = Math.max(0, sessionGainedAfter - sessionGainedBefore)
                totalPoints += gained

                // Optimized Human-Like Cooldown between activities
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error)
                
                // [v61.1.75] RETHROW THROTTLE ERROR: Bubble up to stop the entire activity loop for this account
                if (errMsg === 'SearchThrottledError') {
                    throw error
                }

                this.bot.logger.error(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Error while solving activity "${activity.title}" | message=${errMsg}`
                )
            }
        }
        return totalPoints
    }
}
