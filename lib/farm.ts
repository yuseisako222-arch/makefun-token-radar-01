import type { SnapshotProtocol } from './model.ts';

interface PlanContext {
  name: string;
  chain: string;
  asset: string;
  capital: string;
  testSize: string;
  gas: string;
}

type Playbook = (context: PlanContext) => string[];

function step(action: string, cost: string, time: string): string {
  return `${action} Cost: ${cost}. Time: ${time}.`;
}

function risk(text: string): string {
  return step(`Risk. ${text} Points and airdrops are never guaranteed.`, '$0 to review', '2–5 min before funding');
}

// Gas ranges are planning reserves for a small set of signatures, including exit.
// Each transaction still uses the wallet quote. Trade, bridge and product fees are separate.
function gasReserve(chain: string): string {
  if (chain === 'Ethereum') return '$5–$30 in ETH gas';
  if (chain === 'Bitcoin') return '$2–$20 in BTC network fees';
  if (chain === 'Solana') return 'up to $2 in SOL fees and account setup';
  if (['Arbitrum', 'Base', 'Ink', 'Optimism', 'Polygon', 'Mantle', 'World Chain', 'zkSync Era'].includes(chain)) {
    return '$1–$5 in network gas';
  }
  return '$1–$10 in native network fees as a starting reserve';
}

function capitalFor(tvl: number): number {
  if (tvl >= 1e9) return 250;
  if (tvl >= 250e6) return 150;
  if (tvl >= 50e6) return 100;
  return 50;
}

const dex: Playbook = ({ name, chain, asset, capital, testSize, gas }) => [
  step(`On ${chain}, open ${name}'s swap or spot market. Verify token identifiers, market depth and the minimum output for a small quote around ${asset}.`, '$0 to quote', '5–10 min'),
  risk('Thin markets create slippage, and an LP position can underperform holding the same assets.'),
  step(`Swap up to ${testSize} into a supported asset you already intend to use. Leave the rest of the ${capital} budget uncommitted while checking execution price.`, `${testSize} trade capital, plus a reserve of ${gas} and the quoted trading fee`, '5–15 min'),
  step('Compare the fill with the quote. If you want LP exposure and the venue accepts passive liquidity, check the pool fee, deposit ratio and withdrawal terms before adding the two assets.', 'same budget plus any quoted approval and pool fees', '10–20 min once'),
  step('Review the market weekly if you hold a position. Remove liquidity when finished, or repeat a swap only when you need to rebalance.', 'wallet-quoted gas and swap fees on each return', '5–15 min per visit'),
];

const lending: Playbook = ({ name, chain, asset, capital, gas }) => [
  step(`Open a ${name} supply market on ${chain}. Find ${asset} in the supported list and check the supply cap, available withdrawal liquidity and minimum size.`, '$0 to inspect', '5–10 min'),
  risk('Contract failures or bad debt can impair withdrawals, and borrowed positions can be liquidated.'),
  step(`Supply up to ${capital} of the supported asset. Leave collateral use disabled if the market permits it and your goal is to lend.`, `${capital} deposit plus a reserve of ${gas}`, '5–15 min'),
  step('Check the rate and withdrawal liquidity weekly. Before any separate borrow, confirm terms and liquidation limits. Track the health factor daily if you open debt.', '$0 to monitor, plus variable interest on any debt', '5–10 min per review'),
  step('Repay any outstanding debt and withdraw the supplied asset when finished. If liquidity is tight, check when the market can service a withdrawal.', 'wallet-quoted exit gas and any unpaid interest', '5–15 min plus any liquidity wait'),
];

const bridge: Playbook = ({ name, chain, asset, capital, testSize, gas }) => [
  step(`In ${name}, find a supported route touching ${chain}. Check direction, token identifier, destination wallet and the return route. Quote ${asset} only if the route lists it.`, '$0 to quote', '5–10 min'),
  risk('Validator or contract failure can leave funds stranded, and canonical exits can take several days.'),
  step(`Send a test of up to ${testSize} above the route minimum and within a ${capital} transfer budget. Keep the destination chain's fee token available before sending.`, `${testSize} test capital, a reserve of ${gas} for the ${chain} leg, and quoted fees for the other leg and relay`, '5–15 min to submit'),
  step('Verify the destination balance and token identifier. If the route requires a separate claim, use the published bridge interface and keep the transfer hash.', 'quoted destination gas if a claim is required', 'minutes to days depending on route'),
  step('Repeat only when moving funds between those networks again. Check the return quote and finality window before bringing funds back.', 'new route quote and network fees for each transfer', '5–10 min to recheck'),
];

const yieldVault: Playbook = ({ name, chain, asset, capital, gas }) => [
  step(`On ${chain}, check whether ${name} offers a vault or yield market accepting ${asset}. Read the strategy, underlying exposures, fees and redemption window first.`, '$0 to inspect', '10–15 min'),
  risk('A headline yield can change quickly, and strategy losses or withdrawal queues may affect principal.'),
  step(`If there is an eligible deposit or purchase, use up to ${capital} in its listed asset. Record the share or position balance and its redemption terms.`, `${capital} capital plus a reserve of ${gas} and any quoted entry fee`, '5–15 min'),
  step('Review weekly for changes in redemption liquidity, share value and underlying exposure. Add capital only if the new terms still suit you.', '$0 to review, plus wallet-quoted gas for any new deposit', '5–10 min weekly'),
  step('When leaving, request redemption or sell through the documented exit. Check whether you must return later to finalize a withdrawal.', 'wallet-quoted exit gas plus any fee or sale slippage', '5–15 min plus any queue'),
];

const curator: Playbook = ({ name, chain, asset, capital, gas }) => [
  step(`Find a live vault curated by ${name} on ${chain} through its hosting market. Verify the curator and vault address, then look for a single-asset vault accepting ${asset}.`, '$0 to inspect', '10–15 min'),
  risk('Curator decisions can concentrate exposure. A borrower default or a vault contract failure can reduce what you recover.'),
  step(`Read the vault's borrower collateral, caps and exit liquidity. If the allocation suits you, deposit up to ${capital} directly into the verified vault and record the shares.`, `${capital} deposit plus a reserve of ${gas} and any disclosed vault fee`, '10–15 min'),
  step('Review weekly and after allocation changes. Look at the largest market exposures and any pending changes in caps or withdrawals.', '$0 to review', '5–10 min weekly'),
  step('Use the host market to preview a redemption. If immediate liquidity is limited, use the documented queue or withdraw in smaller tranches only when needed.', 'wallet-quoted gas for each redemption', '5–15 min plus any queue'),
];

const derivatives: Playbook = ({ name, chain, asset, capital, testSize, gas }) => [
  step(`Open ${name}'s derivatives interface on ${chain}. If it lists a perpetual market, check the margin asset, contract minimum, funding, trading fees and liquidation rules.`, '$0 to inspect', '10–15 min'),
  risk('Funding and liquidation can consume margin. A hedge can still lose money when the hedge and underlying diverge.'),
  step(`If you already need a hedge, quote up to ${testSize} of notional at 1× effective leverage with isolated margin where available. Use ${asset} only if accepted, within a ${capital} budget. Open it only if the terms fit the hedge.`, `${testSize} margin for that example, plus a reserve of ${gas} and quoted fees`, '5–15 min'),
  step('While the position is open, check margin and funding daily. Avoid adding trade volume solely to create a record of activity.', 'variable funding and any margin adjustment fees', '5 min daily'),
  step('When the hedge ends, close the position, confirm there is no remaining exposure and withdraw the available margin. Repeat only when you have a new hedge to make.', 'wallet-quoted gas plus closing and withdrawal fees', '5–15 min'),
];

const cdp: Playbook = ({ name, chain, capital, gas }) => [
  step(`In ${name} on ${chain}, inspect the collateral list and choose a supported asset you already hold. Check the minimum debt, collateral ratio, liquidation penalty and stability fee.`, '$0 to inspect', '10–15 min'),
  risk('A collateral drawdown can trigger liquidation, and a depeg can make debt expensive to close.'),
  step(`Preview locking up to ${capital} of that collateral and minting the protocol's stable asset. Proceed only if the debt minimum fits at a ratio comfortably above the liquidation threshold.`, `${capital} in locked collateral plus a reserve of ${gas} and the stability fee`, '10–20 min'),
  step('Keep minted funds available for repayment and monitor collateral headroom daily while debt is open. Repeat only if you need to draw more liquidity within the same risk limits.', '$0 to monitor, plus any accrued stability fee', '5–10 min daily'),
  step('Repay the minted stable asset and fees, then withdraw the unlocked collateral. Verify the remaining debt is zero.', 'wallet-quoted gas and the outstanding debt plus fees', '5–15 min'),
];

const staking: Playbook = ({ name, chain, capital, gas }) => [
  step(`Check ${name}'s staking or delegation surface on ${chain}. Verify the stake asset, operator, minimum, unbonding time and what redemption returns.`, '$0 to inspect', '10–15 min'),
  risk('Slashing, receipt-token discounts and unbonding delays can reduce or delay what you recover.'),
  step(`If direct deposits are supported, stake or delegate up to ${capital} of the listed asset. Record the receipt or delegation reference and leave enough balance for the exit.`, `${capital} stake plus a reserve of ${gas} and any operator fee`, '5–15 min'),
  step('Review the operator and withdrawal terms weekly. Add stake only when you intend to increase the underlying exposure.', '$0 to monitor, plus fees for any new stake', '5 min weekly'),
  step('When finished, request unstaking through the documented exit. Check when the underlying can be claimed and whether claiming takes another signature.', 'wallet-quoted exit and claim fees', '5–10 min plus documented unbonding'),
];

const services: Playbook = ({ name, chain, capital, gas }) => [
  step(`Start with ${name}'s public documentation. Check whether it offers a retail product on ${chain}, which wallets are supported, and whether verification or regional restrictions apply.`, '$0 to inspect', '10–15 min'),
  risk('Provider custody, product eligibility and withdrawal restrictions depend on the service.'),
  step(`Preview one use of the documented product, such as a transfer to your own wallet if it supports payments. If the feature requires custody or a balance, review the withdrawal terms before committing any of the ${capital} test budget.`, `$0 if previewing only, or up to ${capital} plus a reserve of ${gas} for onchain use and any service fee`, '10–20 min plus any eligibility checks'),
  step('If you proceed, verify the receipt or wallet balance and save the transaction reference. If there is no public action, finish after the preview.', '$0 to verify', '5–10 min'),
  step('Return only when you need the service again. Recover any remaining test balance through the published withdrawal path if the product holds funds.', 'quoted network and service fees on any repeat or withdrawal', '5–15 min per use'),
];

const realWorldAssets: Playbook = ({ name, chain, asset, capital, gas }) => [
  step(`Read ${name}'s offering and redemption terms on ${chain}. Check investor eligibility, identity verification, minimum subscription and what legal claim the receipt represents.`, '$0 to inspect', '15–25 min plus any verification'),
  risk('Issuer credit risk and offchain settlement can delay or impair redemptions.'),
  step(`Preview a subscription of up to ${capital} if the minimum and eligibility allow it. Use ${asset} only if listed as a settlement asset and note the settlement date.`, `${capital} if you subscribe, plus a reserve of ${gas} and disclosed subscription charges`, '10–15 min plus settlement'),
  step('Check the published NAV and next redemption window monthly. Subscribe again only when the legal and liquidity terms still suit you.', '$0 to review', '10 min monthly'),
  step('When exiting, use the issuer’s documented redemption process and retain the settlement confirmation.', 'quoted redemption and network fees', '10–15 min plus settlement'),
];

const PLAYBOOKS = new Map<string, Playbook>([
  ['dexs', dex],
  ['dex aggregator', dex],
  ['lending', lending],
  ['uncollateralized lending', lending],
  ['bridge', bridge],
  ['canonical bridge', bridge],
  ['yield', yieldVault],
  ['yield aggregator', yieldVault],
  ['basis trading', yieldVault],
  ['farm', yieldVault],
  ['indexes', yieldVault],
  ['leveraged farming', yieldVault],
  ['liquidity manager', yieldVault],
  ['stablecoin wrapper', yieldVault],
  ['risk curators', curator],
  ['onchain capital allocator', yieldVault],
  ['derivatives', derivatives],
  ['perps', derivatives],
  ['perpetuals', derivatives],
  ['dexs derivatives', derivatives],
  ['cdp', cdp],
  ['staking pool', staking],
  ['liquid staking', staking],
  ['restaking', staking],
  ['liquid restaking', staking],
  ['rwa', realWorldAssets],
]);

export function farmSteps(p: SnapshotProtocol): string[] {
  const primary = p.chains[0];
  const chain = primary ?? 'the supported network';
  const playbook = PLAYBOOKS.get(p.category?.toLowerCase() ?? '') ?? services;
  const capital = capitalFor(p.tvl_usd);
  let asset = 'USDC or another listed settlement asset';
  if (primary === 'Bitcoin') asset = 'BTC or another listed route asset';
  if (primary === 'Bittensor') asset = 'TAO or another listed market asset';
  if (primary === 'Ripple') asset = 'XRP or another listed market asset';

  return playbook({
    name: p.name,
    chain,
    asset,
    capital: `$${capital}`,
    testSize: `$${capital / 5}`,
    gas: gasReserve(chain),
  });
}
