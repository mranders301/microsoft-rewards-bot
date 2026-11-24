import type { MicrosoftRewardsBot } from '../index'
import type { Page } from 'patchright'

// App
import { DailyCheckIn } from './activities/app/DailyCheckIn'
import { ReadToEarn } from './activities/app/ReadToEarn'
import { AppReward } from './activities/app/AppReward'

// API
import { UrlReward } from './activities/api/UrlReward'
import { Quiz } from './activities/api/Quiz'
import { FindClippy } from './activities/api/FindClippy'
import { DoubleSearchPoints } from './activities/api/DoubleSearchPoints'

// Browser
import { SearchOnBing } from './activities/browser/SearchOnBing'
import { Search } from './activities/browser/Search'

import type {
    BasePromotion,
    DashboardData,
    FindClippyPromotion,
    PurplePromotionalItem
} from '../interface/DashboardData'
import type { Promotion } from '../interface/AppDashBoardData'

import { EnsureStreakProtection } from './activities/api/EnsureStreakProtection'
import { ActivateSearchPerk } from './activities/api/ActivateSearchPerk'
import { VisualSearch } from './activities/api/VisualSearch'

export default class Activities {
    private bot: MicrosoftRewardsBot
    
    // Persistent Worker Singletons
    private instances: {
        dailyCheckIn?: DailyCheckIn
        readToEarn?: ReadToEarn
        appReward?: AppReward
        urlReward?: UrlReward
        quiz?: Quiz
        findClippy?: FindClippy
        doubleSearchPoints?: DoubleSearchPoints
        searchOnBing?: SearchOnBing
        search?: Search
        ensureStreakProtection?: EnsureStreakProtection
        activateSearchPerk?: ActivateSearchPerk
        visualSearch?: VisualSearch
    } = {}

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    // Browser Activities
    doSearch = async (data: DashboardData, page: Page, isMobile: boolean, batchLimit = 0): Promise<number> => {
        if (!this.instances.search) this.instances.search = new Search(this.bot)
        return await this.instances.search.doSearch(data, page, isMobile, batchLimit)
    }

    doSearchOnBing = async (promotion: BasePromotion, page: Page): Promise<void> => {
        if (!this.instances.searchOnBing) this.instances.searchOnBing = new SearchOnBing(this.bot)
        await this.instances.searchOnBing.doSearchOnBing(promotion, page)
    }

    // API Activities
    doUrlReward = async (promotion: BasePromotion, page?: Page): Promise<void> => {
        if (!this.instances.urlReward) this.instances.urlReward = new UrlReward(this.bot)
        await this.instances.urlReward.doUrlReward(promotion, page)
    }

    doQuiz = async (promotion: BasePromotion): Promise<void> => {
        if (!this.instances.quiz) this.instances.quiz = new Quiz(this.bot)
        await this.instances.quiz.doQuiz(promotion)
    }

    doFindClippy = async (promotion: FindClippyPromotion): Promise<void> => {
        if (!this.instances.findClippy) this.instances.findClippy = new FindClippy(this.bot)
        await this.instances.findClippy.doFindClippy(promotion)
    }

    doDoubleSearchPoints = async (promotion: PurplePromotionalItem): Promise<void> => {
        if (!this.instances.doubleSearchPoints) this.instances.doubleSearchPoints = new DoubleSearchPoints(this.bot)
        await this.instances.doubleSearchPoints.doDoubleSearchPoints(promotion)
    }

    // App Activities
    doAppReward = async (promotion: Promotion): Promise<void> => {
        if (!this.instances.appReward) this.instances.appReward = new AppReward(this.bot)
        await this.instances.appReward.doAppReward(promotion)
    }

    doReadToEarn = async (): Promise<{ points: number; success: boolean }> => {
        if (!this.instances.readToEarn) this.instances.readToEarn = new ReadToEarn(this.bot)
        try {
            await this.instances.readToEarn.doReadToEarn()
            return { points: 30, success: true }
        } catch {
            return { points: 0, success: false }
        }
    }

    doDailyCheckIn = async (): Promise<{ points: number; success: boolean }> => {
        if (!this.instances.dailyCheckIn) this.instances.dailyCheckIn = new DailyCheckIn(this.bot)
        try {
            await this.instances.dailyCheckIn.doDailyCheckIn()
            return { points: 5, success: true }
        } catch {
            return { points: 0, success: false }
        }
    }

    doStreakProtection = async (): Promise<void> => {
        if (!this.instances.ensureStreakProtection) this.instances.ensureStreakProtection = new EnsureStreakProtection(this.bot)
        await this.instances.ensureStreakProtection.ensureStreakProtection()
    }

    doActivateSearchPerk = async (data: DashboardData): Promise<void> => {
        if (!this.instances.activateSearchPerk) this.instances.activateSearchPerk = new ActivateSearchPerk(this.bot)
        await this.instances.activateSearchPerk.activate(data)
    }

    doVisualSearch = async (data: DashboardData): Promise<number> => {
        if (!this.instances.visualSearch) this.instances.visualSearch = new VisualSearch(this.bot)
        return await this.instances.visualSearch.doVisualSearch(data)
    }
}
