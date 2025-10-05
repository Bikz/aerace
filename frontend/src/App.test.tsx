import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock(
  "@typespec/ts-http-runtime/internal/logger",
  () => {
    const makeDebugger = () => {
      const stub: any = jest.fn();
      stub.enabled = false;
      stub.destroy = jest.fn(() => true);
      stub.log = jest.fn();
      stub.namespace = "test";
      stub.extend = jest.fn(() => stub);
      return stub;
    };

    const logger = {
      info: makeDebugger(),
      warning: makeDebugger(),
      error: makeDebugger(),
      verbose: makeDebugger(),
    };

    return {
      createLoggerContext: () => ({
        logger,
        setLogLevel: jest.fn(),
        getLogLevel: jest.fn(() => undefined),
        createClientLogger: () => makeDebugger(),
      }),
    };
  },
  { virtual: true },
);

jest.mock(
  "@typespec/ts-http-runtime/internal/policies",
  () => ({
    createDefaultHttpClient: () => ({ sendRequest: jest.fn(async () => ({ status: 200 })) }),
  }),
  { virtual: true },
);

jest.mock(
  "@typespec/ts-http-runtime/internal/util",
  () => ({ createAbortController: () => new AbortController() }),
  { virtual: true },
);

const mockContract = {
  methods: {
    getMarketCounter: jest.fn(async () => ({ decodedResult: 0 })),
    getMarketData: jest.fn(async () => ({ decodedResult: undefined })),
    getRake: jest.fn(async () => ({ decodedResult: 20000 })),
    createMarket: jest.fn(async () => undefined),
    placeBet: jest.fn(async () => undefined),
    requestOraclePrice: jest.fn(async () => undefined),
    claimPayout: jest.fn(async () => undefined),
  },
};

jest.mock("@aeternity/aepp-sdk", () => {
  const actual = jest.requireActual("@aeternity/aepp-sdk");
  return {
    ...actual,
    Contract: {
      ...actual.Contract,
      initialize: jest.fn(async () => mockContract),
    },
  };
});

import App from "./App";

const mockConnectToWallet = jest.fn(async () => undefined);
const mockDisconnectWallet = jest.fn(() => undefined);

jest.mock("./hooks/useAeternitySDK", () => {
  return () => ({
    aeSdk: {
      getBalance: jest.fn(async () => "0"),
      initializeContract: jest.fn(async () => mockContract),
    },
    connectToWallet: mockConnectToWallet,
    disconnectWallet: mockDisconnectWallet,
    address: undefined,
    networkId: undefined,
  });
});

let fetchMock: jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  fetchMock = jest
    .fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify({})),
    ) as jest.MockedFunction<typeof fetch>;
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  jest.clearAllMocks();
});

test("shows landing call to action", async () => {
  render(<App />);
  const launchButton = screen.getByRole("button", { name: /launch app/i });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(launchButton).toBeInTheDocument();
});

test("enters trading interface after launching", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: /launch app/i }));

  const connectButton = await screen.findByRole("button", { name: /connect wallet/i });
  await user.click(connectButton);
  expect(mockConnectToWallet).toHaveBeenCalled();

  const heading = await screen.findByRole("heading", { name: /aerace markets/i });
  expect(heading).toBeInTheDocument();
  expect(screen.getByText(/No markets yet/i)).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
});
