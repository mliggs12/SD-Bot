import { AssetInfo, RequesterAssetsData } from '../types';
import { FRESHSERVICE_ASSET_SELECTORS } from '../utils/config';
import { formatErrorWithStack } from '../utils/error-handler';

/**
 * Scrapes the assets assigned to a requester from their FreshService profile
 * page (the Assets tab panel is present in the initial page HTML, so this
 * does not require the tab to be clicked/visible)
 */
export function scrapeRequesterAssets(): RequesterAssetsData {
  try {
    const container = document.querySelector(FRESHSERVICE_ASSET_SELECTORS.assignmentList);
    if (!container) {
      return {
        success: false,
        assets: [],
        error: `Assets list container (${FRESHSERVICE_ASSET_SELECTORS.assignmentList}) not found. Page title: "${document.title}".`,
      };
    }

    const items = container.querySelectorAll<HTMLElement>(FRESHSERVICE_ASSET_SELECTORS.assignmentItem);
    const assets: AssetInfo[] = [];

    for (const item of items) {
      const link = item.querySelector<HTMLAnchorElement>(FRESHSERVICE_ASSET_SELECTORS.assetNameLink);
      const assetTag = link?.textContent?.trim();
      if (!link || !assetTag) continue;

      const href = link.getAttribute('href') || '';
      const idMatch = href.match(/\/cmdb\/items\/(\d+)/);
      assets.push({ assetTag, assetId: idMatch?.[1] ?? '' });
    }

    return { success: true, assets };
  } catch (error) {
    return {
      success: false,
      assets: [],
      error: `Error scraping requester assets: ${formatErrorWithStack(error, true)}`,
    };
  }
}
