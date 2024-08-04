import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { StatusCode } from 'hono/utils/http-status';

import {
  ActionPostResponse,
  ActionError,
  TransactionParameters,
  validateActionPostRequestBody,
  HttpError,
  createActionError,
  ActionPostRequestBody,
  ActionGetResponse,
  chains,
  Chain,
  Address,
  Hex,
  formatZodError,
} from '@ethlinks/sdk';
import {
  createThirdwebClient,
  getContract,
  toSerializableTransaction,
} from 'thirdweb';
import { claimTo } from 'thirdweb/extensions/erc721';
import { ZodError } from 'zod';

const NFT_CONTRACT_ADDRESS = '0x250E7409dA32f078E0531b2d7AAE388027743787';
const MINT_AMOUNT_OPTIONS = [1, 2, 3]; // mint 1NFT or 2NFTs or 3NFTs
const CHAIN: Chain = chains.baseSepolia;
const THIRDWEB_CLIENT_ID = '0ebefcf3e69b22d4a002b8c93ece19c8';
const client = createThirdwebClient({ clientId: THIRDWEB_CLIENT_ID });

const app = new Hono();

// CORS middleware
app.use('/*', cors());

// GET response returns metadata about the action
app.get('/api/mint', async (c) => {
  const response: ActionGetResponse = {
    chainId: CHAIN.id,
    icon: 'https://media.decentralized-content.com/-/rs:fit:1080:1080/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWFmeWVsZHB5YmgydGljbm10dW1mM2pubjdpdWlncWt5NnRtaDV4bTJ3aWY3dHZ4Mm15cWU',
    label: 'Mint NFT',
    title: 'Mint OpenEdition NFT',
    description: 'Mint OpenEdition NFT to celebrate X',
    links: {
      actions: [
        ...MINT_AMOUNT_OPTIONS.map((amount) => ({
          label: `${amount} NFT${amount === 1 ? '' : 's'}`,
          href: `/api/mint/${amount}`,
        })),
        {
          href: '/api/mint/{amount}',
          label: 'Mint',
          parameters: [
            {
              name: 'amount',
              label: 'Enter amount of NFTs to mint',
            },
          ],
        },
      ],
    },
  };

  return c.json(response);
});

// POST response returns transactoin params to send to blockchain
app.post('/api/mint/:amount', async (c) => {
  try {
    const body: ActionPostRequestBody = await c.req.json();

    const validatedBody = validateActionPostRequestBody(body);

    // account address
    const { account } = validatedBody;

    // amount of nfts to mint (string)
    const amountStr = c.req.param('amount');

    if (!amountStr) {
      throw new HttpError(400, 'Mint amount is required');
    }
    // amount of nfts to mint (bigint)
    let amount: bigint;

    try {
      amount = BigInt(amountStr);
    } catch (error) {
      throw new HttpError(400, 'Invalid NFT amount');
    }

    const nftContract = getContract({
      client: client,
      address: NFT_CONTRACT_ADDRESS,
      chain: CHAIN,
    });

    console.log('nftContract: ', nftContract);

    const preparedTx = claimTo({
      contract: nftContract,
      to: account,
      from: account,
      quantity: amount,
    });

    const serializableTx = await toSerializableTransaction({
      transaction: preparedTx,
      from: account,
    });

    console.log('serializableTx: ', serializableTx);

    // return tx params to then sign and send to blockchain on the client side
    const responseTx: TransactionParameters = {
      to: serializableTx.to as Address,
      value: (serializableTx.value as bigint).toString(),
      data: serializableTx.data as Hex,
      chainId: serializableTx.chainId as number,
    };

    const response: ActionPostResponse = {
      transaction: responseTx,
      message: `Mint ${amountStr} NFT(s) to ${account}`,
    };

    return c.json(response);
  } catch (error) {
    console.log('error: ', error);
    console.error('Error processing transaction request:', error);

    if (error instanceof ZodError) {
      return c.json(createActionError(formatZodError(error)));
    }

    if (error instanceof HttpError) {
      return c.json(
        createActionError(error.message),
        error.statusCode as StatusCode
      );
    }

    const actionError: ActionError = createActionError(
      error instanceof Error ? error.message : 'Internal server error'
    );

    return c.json(actionError, 500);
  }
});

export default app;
