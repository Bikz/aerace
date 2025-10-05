import { render, screen } from "@testing-library/react";
import App from "./App";

const mockContract = {
  methods: {
    getMarketCounter: async () => ({ decodedResult: 0 }),
    getMarketData: async () => ({
      decodedResult: {
        id: 1,
        barrier_up: 150,
        barrier_down: 100,
        expiry: 999999,
        is_race: false,
        status: "StatusOpen",
        total_up: 0,
        total_down: 0,
      },
    }),
  },
};

jest.mock("./hooks/useAeternitySDK", () => {
  return () => ({
    aeSdk: {
      getBalance: async () => "0",
      initializeContract: async () => mockContract,
    },
    connectToWallet: jest.fn(async () => undefined),
    address: undefined,
    networkId: undefined,
  });
});

test("renders heading", () => {
  render(<App />);
  const heading = screen.getByText(/Barrier Options/i);
  expect(heading).toBeInTheDocument();
});
