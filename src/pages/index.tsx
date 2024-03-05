import Head from "next/head";
import { Inter } from "next/font/google";
import styles from "@/styles/Home.module.css";
import LedgerETH from "@ledgerhq/hw-app-eth";
import { Stark as LedgerStark } from "@ledgerhq/hw-app-starknet";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import { useState } from "react";
import {
  Account,
  AccountInterface,
  CairoCustomEnum,
  Call,
  CallData,
  DeployAccountContractPayload,
  RpcProvider,
  constants,
  hash
} from "starknet";
import {
  STARKNET_DERIVATE_PATH,
  MULTISIG_CLASS_HASH,
  ETH_DERIVATE_PATH
} from "@/constants";
import { MultisigEthSigner } from "@/service/multisigEthSigner";
import { MultisigStarknetSigner } from "@/service/multisigStarknetSigner";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const [eth, setEth] = useState<LedgerETH | null>(null);
  const [stark, setStark] = useState<LedgerStark | null>(null);
  const [messageHash, setMessageHash] = useState<string>();
  const [ethPublicKey, setEthPublicKey] = useState<string>();
  const [starkPublicKey, setStarkPublicKey] = useState<string>();
  const [multisig, setMultisig] = useState<AccountInterface>();
  const [multisigAddress, setMultisigAddress] = useState<string>();
  const [txHash, setTxHash] = useState<string>();

  // const onConnectLedger = async () => {
  //   const transport = await TransportWebHID.create();

  //   // const eth = new LedgerETH(transport);
  //   const stark = new LedgerStark(transport);

  //   const { publicKey, errorMessage, returnCode } = await stark.getPubKey(
  //     STARKNET_DERIVATE_PATH
  //   );
  //   console.log("🚀 ~ onConnectLedger ~  errorMessage:", errorMessage);
  //   console.log("🚀 ~ onConnectLedger ~ publicKey:", publicKey);

  //   // convert uint8array to hex

  //   setStarkPublicKey(encode.addHexPrefix(encode.buf2hex(publicKey)));
  //   // setAddress(publicKey);
  //   setStark(stark);
  // };

  const onConnectLedger = async () => {
    const transport = await TransportWebHID.create();

    const eth = new LedgerETH(transport);

    const { address } = await eth.getAddress(ETH_DERIVATE_PATH);
    setEthPublicKey(address);
    setEth(eth);

    const multisigPayload = getDeployAccountPayload(address);

    const multisigAddress = hash.calculateContractAddressFromHash(
      multisigPayload.addressSalt!,
      multisigPayload.classHash,
      multisigPayload.constructorCalldata!,
      0
    );

    setMultisigAddress(multisigAddress);
  };

  const getDeployAccountPayload = (
    ethPubKey?: string,
    starkPubKey?: string
  ) => {
    return {
      classHash: MULTISIG_CLASS_HASH,
      constructorCalldata: CallData.compile({
        threshold: 1,
        signers: [
          new CairoCustomEnum({
            Starknet: starkPubKey,
            Secp256k1: undefined,
            Secp256r1: undefined,
            Eip191: ethPubKey,
            Webauthn: undefined
          })
        ] // Initial signers
      }),
      addressSalt: starkPubKey || ethPubKey
    };
  };

  const deployAccountTx = async () => {
    let payload: DeployAccountContractPayload = getDeployAccountPayload(
      ethPublicKey,
      starkPublicKey
    );

    payload = {
      ...payload,
      contractAddress: multisigAddress
    };

    const signer = eth
      ? new MultisigEthSigner(eth, ETH_DERIVATE_PATH)
      : stark
      ? new MultisigStarknetSigner(stark, STARKNET_DERIVATE_PATH)
      : null;

    const rpcProvider = new RpcProvider({
      nodeUrl: "https://cloud.argent-api.com/v1/starknet/goerli/rpc/v0.6",
      chainId: constants.StarknetChainId.SN_GOERLI,
      headers: {
        "argent-version": process.env.VERSION || "Unknown version",
        "argent-client": "argent-x"
      }
    });

    if (!signer) {
      throw new Error("No signer found");
    }

    if (!multisigAddress) {
      throw new Error("No multisig address found");
    }

    const multisig = new Account(rpcProvider, multisigAddress, signer, "1");

    try {
      // Check if already deployed
      await multisig.getClassHashAt(multisigAddress);
      setMultisig(multisig);
    } catch {
      const { suggestedMaxFee } = await multisig.estimateAccountDeployFee(
        payload,
        { skipValidate: false }
      );

      const response = await multisig.deployAccount(payload, {
        maxFee: suggestedMaxFee
      });
      console.log("🚀 ~ deployAccountTx ~ response:", response);

      setMultisig(multisig);
      setTxHash(response.transaction_hash);
    }
  };

  const signTransaction = async () => {
    if (!multisig) {
      throw new Error("No multisig found");
    }

    const transferCall: Call = {
      contractAddress:
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      entrypoint: "transfer",
      calldata: [multisig.address, "1000", "0"]
    };

    const signer = eth
      ? new MultisigEthSigner(eth, ETH_DERIVATE_PATH)
      : stark
      ? new MultisigStarknetSigner(stark, STARKNET_DERIVATE_PATH)
      : null;

    if (!signer) {
      throw new Error("No signer found");
    }

    const { suggestedMaxFee } = await multisig.estimateInvokeFee(transferCall, {
      skipValidate: false
    });
    console.log("🚀 ~ signTransaction ~ suggestedMaxFee:", suggestedMaxFee);

    const response = await multisig.execute(transferCall, undefined, {
      maxFee: suggestedMaxFee
    });

    setTxHash(response.transaction_hash);
  };

  return (
    <>
      <Head>
        <title>Ledger-Argent Test</title>
        <meta name="description" content="Generated by create next app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <h1 className={styles.title}>Ledger-Argent Test</h1>
        <section className={styles.section}>
          <p className={styles.description}>
            This is a test for the Ledger-Argent company
          </p>
          <div className={styles.buttons}>
            {!ethPublicKey && !starkPublicKey ? (
              <button className={styles.button} onClick={onConnectLedger}>
                Connect ledger
              </button>
            ) : (
              <div className={styles.info}>
                <div>
                  Signer: {ethPublicKey ? ethPublicKey : starkPublicKey}
                </div>
                {multisigAddress && (
                  <div>Multisig Address: {multisigAddress}</div>
                )}
              </div>
            )}
          </div>
          {ethPublicKey || starkPublicKey ? (
            <div className={styles.buttons}>
              {multisig ? (
                <button className={styles.button} onClick={signTransaction}>
                  Sign transaction
                </button>
              ) : (
                <button className={styles.button} onClick={deployAccountTx}>
                  Deploy Multisig
                </button>
              )}
            </div>
          ) : null}

          {txHash && <p>Tx Hash: {txHash}</p>}
        </section>
      </main>
    </>
  );
}
