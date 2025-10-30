export const createTagAddress = async (tag) => {
  const contract = await this.getContract();
  const feltTag = shortString.encodeShortString(tag);
  const tx = await contract.register_tag(feltTag);
  await this.provider.waitForTransaction(tx.transaction_hash);
  const newTag = await contract.get_tag_wallet_address(feltTag);
  return newTag && newTag !== "0x0" ? `0x${BigInt(newTag).toString(16)}` : null;
};

export const getTagAddress = async (tag) => {
  const contract = await this.getContract();
  const feltTag = shortString.encodeShortString(tag);
  return await contract.get_tag_wallet_address(feltTag);
};

export const getTagBalance = async (tag) => {
  const contract = await this.getContract();
  const feltTag = shortString.encodeShortString(tag);
  return await contract.getTagBalance(feltTag);
};
