const contracts = {
  barrierAddress:
    process.env.REACT_APP_BARRIER_CONTRACT_ADDRESS ??
    "ct_B6VqJpT4mz4nsJTmyjwRFxxhVfTjd9MxbtVdoS3V2qS8Ewebz",
  oracleId:
    process.env.REACT_APP_PRICE_ORACLE_ID ??
    "ok_2kuKiwQ8FzD7qA4WvkASbHiQ3Wf5FZX7zEe9yCj2CKuHNNZg3E",
  ownerAddress:
    process.env.REACT_APP_OWNER_ADDRESS ??
    "ak_2846VnczSHPD4n3vZxovp7H8Zqxs3y6y2D9zJQJS9aKwPoQAeE",
  oracleQueryFee:
    BigInt(
      process.env.REACT_APP_ORACLE_QUERY_FEE ?? "1000000000000000",
    ),
};

export default contracts;
