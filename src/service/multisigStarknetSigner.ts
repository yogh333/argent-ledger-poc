import {
  Abi,
  Call,
  DeclareSignerDetails,
  DeployAccountSignerDetails,
  InvocationsSignerDetails,
  Signature,
  Signer,
  SignerInterface,
  TypedData,
  V2InvocationsSignerDetails,
  V3InvocationsSignerDetails,
  hash,
  stark,
  transaction,
  RPC,
  CallData,
  V2DeployAccountSignerDetails,
  V3DeployAccountSignerDetails,
  typedData,
  encode,
  CairoCustomEnum,
  uint256,
  num,
  cairo
} from "starknet";
import { StarknetClient as LedgerStark } from "@ledgerhq/hw-app-starknet";
import { hexToSignature, signatureToHex } from "viem";

export class MultisigStarknetSigner implements SignerInterface {
  constructor(public stark: LedgerStark, public derivatePath: string) {}

  async getPubKey(): Promise<string> {
    const { publicKey } = await this.stark.getPubKey(this.derivatePath, false);

    return encode.addHexPrefix(encode.buf2hex(publicKey.slice(0, 32)));
  }

  async signMessage(
    data: TypedData,
    accountAddress: string
  ): Promise<Signature> {
    const msgHash = typedData.getMessageHash(data, accountAddress);
    const sig = await this.stark.signHash(this.derivatePath, msgHash);

    const publicKey = await this.getPubKey();

    return this.starknetSignatureType(publicKey, sig);
  }

  async signTransaction(
    transactions: Call[],
    details: InvocationsSignerDetails,
    abis?: Abi[] | undefined
  ): Promise<Signature> {
    const compiledCalldata = transaction.getExecuteCalldata(
      transactions,
      details.cairoVersion
    );
    let msgHash;

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version as any)
    ) {
      const det = details as V2InvocationsSignerDetails;
      msgHash = hash.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version
      });
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3InvocationsSignerDetails;
      msgHash = hash.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode)
      });
    } else {
      throw Error("unsupported signTransaction version");
    }

    const sig = await this.stark.signHash(this.derivatePath, msgHash);

    const publicKey = await this.getPubKey();

    return [
      publicKey,
      encode.addHexPrefix(encode.buf2hex(sig.r)),
      encode.addHexPrefix(encode.buf2hex(sig.s))
    ];
  }

  public async signDeployAccountTransaction(
    details: DeployAccountSignerDetails
  ): Promise<Signature> {
    const compiledConstructorCalldata = CallData.compile(
      details.constructorCalldata
    );
    /*     const version = BigInt(details.version).toString(); */
    let msgHash;

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version as any)
    ) {
      const det = details as V2DeployAccountSignerDetails;
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        constructorCalldata: compiledConstructorCalldata,
        version: det.version
      });
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3DeployAccountSignerDetails;
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        compiledConstructorCalldata,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode)
      });
    } else {
      throw Error("unsupported signDeployAccountTransaction version");
    }

    // if (msgHash.length < 66) {
    //   msgHash = "0x" + "0".repeat(66 - msgHash.length) + msgHash.slice(2);
    // }

    console.log("🚀 ~ MultisigSigner ~ msgHash:", msgHash);

    const sig = await this.stark.signHash(this.derivatePath, msgHash);
    console.log("🚀 ~ MultisigStarknetSigner ~ sig:", sig);

    // const signedHash = "0x" + r + s + v.toString(16);

    // const sig = hexToSignature(signedHash);

    const publicSigner = await this.getPubKey();
    return [
      publicSigner,
      encode.addHexPrefix(encode.buf2hex(sig.r)),
      encode.addHexPrefix(encode.buf2hex(sig.s))
    ]; // Intentionally publicSigner is hex and signatures are decimal. Backend should be able to handle this
  }

  signDeclareTransaction(
    transaction: DeclareSignerDetails
  ): Promise<Signature> {
    throw new Error("Method not implemented.");
  }

  getYParity(v: number): 0 | 1 {
    return v === 27 ? 0 : 1;
  }

  private starknetSignatureType(
    signer: string,
    signature: { r: Uint8Array; s: Uint8Array }
  ) {
    console.log("🚀 ~ MultisigSigner ~ signature:", signature);
    return CallData.compile([
      new CairoCustomEnum({
        Starknet: {
          signer,
          r: encode.addHexPrefix(encode.buf2hex(signature.r)),
          s: encode.addHexPrefix(encode.buf2hex(signature.s))
        },
        Secp256k1: undefined,
        Secp256r1: undefined,
        Eip191: undefined,
        Webauthn: undefined
      })
    ]);
  }
}
