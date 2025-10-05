const contracts = {
  barrierAddress:
    process.env.REACT_APP_BARRIER_CONTRACT_ADDRESS ??
    "ct_7jTDxrEWXGBBSmhtQPP89aoNZ1qPXreGrszW8rJ86v9QYgu4a",
  oracleId:
    process.env.REACT_APP_PRICE_ORACLE_ID ??
    "ok_tmkuVj9TbRZiGwEJChGBCzFNBz44biwWeMAMKeqbTw54PMwvz",
  ownerAddress:
    process.env.REACT_APP_OWNER_ADDRESS ??
    "ak_mK1NyxjzK4GzZKXWxDfGbeqwEhQfZsNAx24J2NzJGQGUdu6sJ",
  oracleQueryFee:
    BigInt(
      process.env.REACT_APP_ORACLE_QUERY_FEE ?? "1000000000000000",
    ),
};

export default contracts;
