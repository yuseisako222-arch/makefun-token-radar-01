import type { SnapshotProtocol } from './model.ts';

interface PlanContext {
  name: string;
  chain: string;
  asset: string;
  capital: number;
  testSize: number;
  gas: FeeEstimate;
  transactionGas?: FeeEstimate;
}

type ChainClass = 'ethereum-mainnet' | 'l2' | 'solana' | 'alt-l1' | 'generic';
type Amount = number | readonly [number, number];

interface FeeEstimate {
  text: string;
  usd: number;
}

interface FarmStep {
  text: string;
  capital_usd: number;
  fees_usd: number;
}

export interface FarmPlan {
  steps: FarmStep[];
  summary: {
    capital_usd: number;
    fees_usd: number;
    primary_chain: string | null;
    chain_class: ChainClass;
  };
}

type Playbook = (context: PlanContext) => FarmStep[];

// Use the midpoint of a stated range, or the stated position size for a single amount.
function midpoint(amount: Amount): number {
  return typeof amount === 'number' ? amount : (amount[0] + amount[1]) / 2;
}

function step(action: string, cost: string, time: string, capital: Amount = 0, fee?: FeeEstimate): FarmStep {
  return {
    text: `${action} Cost: ${cost}. Time: ${time}.`,
    capital_usd: midpoint(capital),
    fees_usd: fee?.usd ?? 0,
  };
}

function risk(text: string): FarmStep {
  return step(`Risk. ${text} Points and airdrops are never guaranteed.`, '$0 to review', '2–5 min before funding');
}

const L2_CHAINS = new Set([
  'arbitrum', 'arbitrum one', 'arbitrum nova', 'base', 'blast', 'bsquared', 'fluent', 'ink', 'linea',
  'manta', 'manta pacific', 'mantle', 'mezo', 'morph', 'optimism', 'op mainnet', 'polygon zkevm',
  'reya network', 'rise', 'robinhood chain', 'rootstock', 'rsk', 'scroll', 'starknet', 'world chain',
  'zksync', 'zksync era',
]);
const ALT_L1_CHAINS = new Set([
  'algorand', 'aptos', 'arc', 'avalanche', 'berachain', 'binance', 'bittensor', 'bnb',
  'bnb chain', 'bnb smart chain', 'bsc', 'chiliz', 'cronos', 'fantom', 'flare', 'hyperliquid',
  'hyperliquid l1', 'kaia', 'kava', 'klaytn', 'monad', 'noble', 'pharos', 'plasma', 'polygon',
  'polygon pos', 'polygon (pos)', 'proton', 'provenance', 'qubic', 'ripple', 'ronin', 'stable', 'stellar',
  'strato', 'sui', 'tempo', 'ton', 'tron', 'wemix', 'xion', 'xrp ledger',
]);

function classifyChain(chain: string): ChainClass {
  const key = chain.trim().toLowerCase();
  if (key === 'ethereum' || key === 'ethereum mainnet') return 'ethereum-mainnet';
  if (L2_CHAINS.has(key)) return 'l2';
  if (key === 'solana') return 'solana';
  if (ALT_L1_CHAINS.has(key)) return 'alt-l1';
  return 'generic';
}

function feeRange(low: number, high: number, description: string): FeeEstimate {
  const dollars = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
  const cents: Amount = [Math.round(low * 100), Math.round(high * 100)];
  return { text: `${dollars(low)}–${dollars(high)} ${description}`, usd: midpoint(cents) / 100 };
}

const ETH_RESERVE = feeRange(5, 30, 'in ETH gas');
const BTC_RESERVE = feeRange(2, 20, 'in BTC network fees');
const GENERIC_RESERVE = feeRange(1, 10, 'in native network fees as a starting reserve');
const BRIDGE_RESERVE = feeRange(1, 5, 'in bridge and relay fees for the test route');
const TRANSACTION_GAS = {
  l2: feeRange(0.10, 1, 'in network gas per transaction'),
  solana: feeRange(0.01, 0.05, 'in SOL fees per transaction'),
  'alt-l1': feeRange(0.05, 0.50, 'in network fees per transaction'),
};

function bridgeReserve(chain: string, chains: string[], gas: FeeEstimate): FeeEstimate {
  const mainnetNote = '(the Ethereum leg pays mainnet gas)';
  const nativeReserve = `${gas.text} for the ${chain} leg`;
  const otherFees = 'and quoted fees for the other leg and relay';
  if (gas === ETH_RESERVE) return { ...gas, text: `${nativeReserve} ${mainnetNote}, ${otherFees}` };
  if (chains.some((chain) => classifyChain(chain) === 'ethereum-mainnet')) {
    return {
      text: `${nativeReserve}, ${ETH_RESERVE.text} for a route touching Ethereum ${mainnetNote}, and any quoted relay fee`,
      usd: gas.usd + ETH_RESERVE.usd,
    };
  }
  if (gas === BTC_RESERVE || gas === GENERIC_RESERVE) return { ...gas, text: `${nativeReserve}, ${otherFees}` };
  const route = chains.some((chain) => chain.trim().toLowerCase() === 'bitcoin')
    ? { ...BTC_RESERVE, text: `${BTC_RESERVE.text} for the Bitcoin leg` } : BRIDGE_RESERVE;
  return {
    text: `${nativeReserve}, ${route.text}, and any additional fees in the route quote`,
    usd: gas.usd + route.usd,
  };
}

function gasQuote(quote: string, transactionGas?: FeeEstimate): string {
  return transactionGas ? `${quote} (${transactionGas.text})` : quote;
}

function capitalFor(tvl: number): number {
  if (tvl >= 1e9) return 250;
  if (tvl >= 250e6) return 150;
  if (tvl >= 50e6) return 100;
  return 50;
}

const dex: Playbook = ({ name, chain, asset, capital, testSize, gas, transactionGas }) => [
  step(`On ${chain}, open ${name}'s swap or spot market. Verify token identifiers, market depth and the minimum output for a small quote around ${asset}.`, '$0 to quote', '5–10 min'),
  risk('Thin markets create slippage, and an LP position can underperform holding the same assets.'),
  step(`Swap up to $${testSize} into a supported asset you already intend to use. Leave the rest of the $${capital} budget uncommitted while checking execution price.`, `$${testSize} trade capital, plus a reserve of ${gas.text} and the quoted trading fee`, '5–15 min', testSize, gas),
  step('Compare the fill with the quote. If you want LP exposure and the venue accepts passive liquidity, check the pool fee, deposit ratio and withdrawal terms before adding the two assets.', 'same budget plus any quoted approval and pool fees', '10–20 min once'),
  step('Review the market weekly if you hold a position. Remove liquidity when finished, or repeat a swap only when you need to rebalance.', gasQuote('wallet-quoted gas', transactionGas) + ' and swap fees on each return', '5–15 min per visit', 0, transactionGas),
];

const lending: Playbook = ({ name, chain, asset, capital, gas, transactionGas }) => [
  step(`Open a ${name} supply market on ${chain}. Find ${asset} in the supported list and check the supply cap, available withdrawal liquidity and minimum size.`, '$0 to inspect', '5–10 min'),
  risk('Contract failures or bad debt can impair withdrawals, and borrowed positions can be liquidated.'),
  step(`Supply up to $${capital} of the supported asset. Leave collateral use disabled if the market permits it and your goal is to lend.`, `$${capital} deposit plus a reserve of ${gas.text}`, '5–15 min', capital, gas),
  step('Check the rate and withdrawal liquidity weekly. Before any separate borrow, confirm terms and liquidation limits. Track the health factor daily if you open debt.', '$0 to monitor, plus variable interest on any debt', '5–10 min per review'),
  step('Repay any outstanding debt and withdraw the supplied asset when finished. If liquidity is tight, check when the market can service a withdrawal.', gasQuote('wallet-quoted exit gas', transactionGas) + ' and any unpaid interest', '5–15 min plus any liquidity wait', 0, transactionGas),
];

const bridge: Playbook = ({ name, chain, asset, capital, testSize, gas }) => [
  step(`In ${name}, find a supported route touching ${chain}. Check direction, token identifier, destination wallet and the return route. Quote ${asset} only if the route lists it.`, '$0 to quote', '5–10 min'),
  risk('Validator or contract failure can leave funds stranded, and canonical exits can take several days.'),
  step(`Send a test of up to $${testSize} above the route minimum and within a $${capital} transfer budget. Keep the destination chain's fee token available before sending.`, `$${testSize} test capital, a reserve of ${gas.text}`, '5–15 min to submit', testSize, gas),
  step('Verify the destination balance and token identifier. If the route requires a separate claim, use the published bridge interface and keep the transfer hash.', 'quoted destination gas if a claim is required', 'minutes to days depending on route'),
  step('Repeat only when moving funds between those networks again. Check the return quote and finality window before bringing funds back.', 'new route quote and network fees for each transfer', '5–10 min to recheck'),
];

const yieldVault: Playbook = ({ name, chain, asset, capital, gas, transactionGas }) => [
  step(`On ${chain}, check whether ${name} offers a vault or yield market accepting ${asset}. Read the strategy, underlying exposures, fees and redemption window first.`, '$0 to inspect', '10–15 min'),
  risk('A headline yield can change quickly, and strategy losses or withdrawal queues may affect principal.'),
  step(`If there is an eligible deposit or purchase, use up to $${capital} in its listed asset. Record the share or position balance and its redemption terms.`, `$${capital} capital plus a reserve of ${gas.text} and any quoted entry fee`, '5–15 min', capital, gas),
  step('Review weekly for changes in redemption liquidity, share value and underlying exposure. Add capital only if the new terms still suit you.', '$0 to review, plus ' + gasQuote('wallet-quoted gas', transactionGas) + ' for any new deposit', '5–10 min weekly'),
  step('When leaving, request redemption or sell through the documented exit. Check whether you must return later to finalize a withdrawal.', gasQuote('wallet-quoted exit gas', transactionGas) + ' plus any fee or sale slippage', '5–15 min plus any queue', 0, transactionGas),
];

const curator: Playbook = ({ name, chain, asset, capital, gas, transactionGas }) => [
  step(`Find a live vault curated by ${name} on ${chain} through its hosting market. Verify the curator and vault address, then look for a single-asset vault accepting ${asset}.`, '$0 to inspect', '10–15 min'),
  risk('Curator decisions can concentrate exposure. A borrower default or a vault contract failure can reduce what you recover.'),
  step(`Read the vault's borrower collateral, caps and exit liquidity. If the allocation suits you, deposit up to $${capital} directly into the verified vault and record the shares.`, `$${capital} deposit plus a reserve of ${gas.text} and any disclosed vault fee`, '10–15 min', capital, gas),
  step('Review weekly and after allocation changes. Look at the largest market exposures and any pending changes in caps or withdrawals.', '$0 to review', '5–10 min weekly'),
  step('Use the host market to preview a redemption. If immediate liquidity is limited, use the documented queue or withdraw in smaller tranches only when needed.', gasQuote('wallet-quoted gas', transactionGas) + ' for each redemption', '5–15 min plus any queue', 0, transactionGas),
];

const derivatives: Playbook = ({ name, chain, asset, capital, testSize, gas, transactionGas }) => [
  step(`Open ${name}'s derivatives interface on ${chain}. If it lists a perpetual market, check the margin asset, contract minimum, funding, trading fees and liquidation rules.`, '$0 to inspect', '10–15 min'),
  risk('Funding and liquidation can consume margin. A hedge can still lose money when the hedge and underlying diverge.'),
  step(`If you already need a hedge, quote up to $${testSize} of notional at 1× effective leverage with isolated margin where available. Use ${asset} only if accepted, within a $${capital} budget. Open it only if the terms fit the hedge.`, `$${testSize} margin for that example, plus a reserve of ${gas.text} and quoted fees`, '5–15 min', testSize, gas),
  step('While the position is open, check margin and funding daily. Avoid adding trade volume solely to create a record of activity.', 'variable funding and any margin adjustment fees', '5 min daily'),
  step('When the hedge ends, close the position, confirm there is no remaining exposure and withdraw the available margin. Repeat only when you have a new hedge to make.', gasQuote('wallet-quoted gas', transactionGas) + ' plus closing and withdrawal fees', '5–15 min', 0, transactionGas),
];

const cdp: Playbook = ({ name, chain, capital, gas, transactionGas }) => [
  step(`In ${name} on ${chain}, inspect the collateral list and choose a supported asset you already hold. Check the minimum debt, collateral ratio, liquidation penalty and stability fee.`, '$0 to inspect', '10–15 min'),
  risk('A collateral drawdown can trigger liquidation, and a depeg can make debt expensive to close.'),
  step(`Preview locking up to $${capital} of that collateral and minting the protocol's stable asset. Proceed only if the debt minimum fits at a ratio comfortably above the liquidation threshold.`, `$${capital} in locked collateral plus a reserve of ${gas.text} and the stability fee`, '10–20 min', capital, gas),
  step('Keep minted funds available for repayment and monitor collateral headroom daily while debt is open. Repeat only if you need to draw more liquidity within the same risk limits.', '$0 to monitor, plus any accrued stability fee', '5–10 min daily'),
  step('Repay the minted stable asset and fees, then withdraw the unlocked collateral. Verify the remaining debt is zero.', gasQuote('wallet-quoted gas', transactionGas) + ' and the outstanding debt plus fees', '5–15 min', 0, transactionGas),
];

const staking: Playbook = ({ name, chain, capital, gas, transactionGas }) => [
  step(`Check ${name}'s staking or delegation surface on ${chain}. Verify the stake asset, operator, minimum, unbonding time and what redemption returns.`, '$0 to inspect', '10–15 min'),
  risk('Slashing, receipt-token discounts and unbonding delays can reduce or delay what you recover.'),
  step(`If direct deposits are supported, stake or delegate up to $${capital} of the listed asset. Record the receipt or delegation reference and leave enough balance for the exit.`, `$${capital} stake plus a reserve of ${gas.text} and any operator fee`, '5–15 min', capital, gas),
  step('Review the operator and withdrawal terms weekly. Add stake only when you intend to increase the underlying exposure.', '$0 to monitor, plus ' + gasQuote('fees for any new stake', transactionGas), '5 min weekly'),
  step('When finished, request unstaking through the documented exit. Check when the underlying can be claimed and whether claiming takes another signature.', gasQuote('wallet-quoted exit and claim fees', transactionGas), '5–10 min plus documented unbonding', 0, transactionGas),
];

const services: Playbook = ({ name, chain, capital, gas, transactionGas }) => [
  step(`Start with ${name}'s public documentation. Check whether it offers a retail product on ${chain}, which wallets are supported, and whether verification or regional restrictions apply.`, '$0 to inspect', '10–15 min'),
  risk('Provider custody, product eligibility and withdrawal restrictions depend on the service.'),
  step(`Preview one use of the documented product, such as a transfer to your own wallet if it supports payments. If the feature requires custody or a balance, review the withdrawal terms before committing any of the $${capital} test budget.`, `$0 if previewing only, or up to $${capital} plus a reserve of ${gas.text} for onchain use and any service fee`, '10–20 min plus any eligibility checks', capital, gas),
  step('If you proceed, verify the receipt or wallet balance and save the transaction reference. If there is no public action, finish after the preview.', '$0 to verify', '5–10 min'),
  step('Return only when you need the service again. Recover any remaining test balance through the published withdrawal path if the product holds funds.', gasQuote('quoted network and service fees on any repeat or withdrawal', transactionGas), '5–15 min per use', 0, transactionGas),
];

const realWorldAssets: Playbook = ({ name, chain, asset, capital, gas, transactionGas }) => [
  step(`Read ${name}'s offering and redemption terms on ${chain}. Check investor eligibility, identity verification, minimum subscription and what legal claim the receipt represents.`, '$0 to inspect', '15–25 min plus any verification'),
  risk('Issuer credit risk and offchain settlement can delay or impair redemptions.'),
  step(`Preview a subscription of up to $${capital} if the minimum and eligibility allow it. Use ${asset} only if listed as a settlement asset and note the settlement date.`, `$${capital} if you subscribe, plus a reserve of ${gas.text} and disclosed subscription charges`, '10–15 min plus settlement', capital, gas),
  step('Check the published NAV and next redemption window monthly. Subscribe again only when the legal and liquidity terms still suit you.', '$0 to review', '10 min monthly'),
  step('When exiting, use the issuer’s documented redemption process and retain the settlement confirmation.', gasQuote('quoted redemption and network fees', transactionGas), '10–15 min plus settlement', 0, transactionGas),
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

export function farmPlan(p: SnapshotProtocol): FarmPlan {
  const primary = p.chains[0] ?? null;
  const chain = primary ?? 'the supported network';
  const chainClass = classifyChain(chain);
  const playbook = PLAYBOOKS.get(p.category?.toLowerCase() ?? '') ?? services;
  const capital = capitalFor(p.tvl_usd);
  let asset = 'USDC or another listed settlement asset';
  if (primary === 'Bitcoin') asset = 'BTC or another listed route asset';
  if (primary === 'Bittensor') asset = 'TAO or another listed market asset';
  if (primary === 'Ripple') asset = 'XRP or another listed market asset';

  // Mainnet and generic reserves already cover entry and exit. For per-transaction
  // estimates, budget one entry and one exit, with other actions at the quoted price.
  const transactionGas = chainClass === 'ethereum-mainnet' || chainClass === 'generic'
    ? undefined : TRANSACTION_GAS[chainClass];
  const gas = transactionGas ?? (chainClass === 'ethereum-mainnet' ? ETH_RESERVE
    : chain.trim().toLowerCase() === 'bitcoin' ? BTC_RESERVE : GENERIC_RESERVE);
  const steps = playbook({
    name: p.name,
    chain,
    asset,
    capital,
    testSize: capital / 5,
    gas: playbook === bridge ? bridgeReserve(chain, p.chains, gas) : gas,
    transactionGas,
  });
  return {
    steps,
    summary: {
      capital_usd: steps.reduce((total, step) => total + step.capital_usd, 0),
      fees_usd: steps.reduce((total, step) => total + step.fees_usd, 0),
      primary_chain: primary,
      chain_class: chainClass,
    },
  };
}

export function farmSteps(p: SnapshotProtocol): string[] {
  return farmPlan(p).steps.map(({ text }) => text);
}
