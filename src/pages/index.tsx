import Head from "next/head";
import { Inter } from "next/font/google";
import styles from "@/styles/Home.module.css";
import LedgerETH from "@ledgerhq/hw-app-eth";
import { StarknetClient as LedgerStark } from "@ledgerhq/hw-app-starknet";
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
  encode,
  hash,
} from "starknet";
import {
  STARKNET_DERIVATE_PATH,
  MULTISIG_CLASS_HASH,
  ETH_DERIVATE_PATH,
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

  const onConnectLedger = async () => {
    const transport = await TransportWebHID.create();

    if (!transport) {
      console.log("🚀 ~ onConnectLedger ~ transport:", transport);
      return;
    }

    // const eth = new LedgerETH(transport);
    const stark = new LedgerStark(transport);

    console.log(
      "🚀 ~ onConnectLedger ~ STARKNET_DERIVATE_PATH:",
      STARKNET_DERIVATE_PATH,
    );

    const appVersion = await stark.getAppVersion();
    console.log("🚀 ~ onConnectLedger ~ appVersion:", appVersion);

    // let key = "";

    // for (let i = 0; i < 5; i++) {
    //   const derivationPath = STARKNET_DERIVATE_PATH + "/" + i;
    //   console.log("🚀 ~ onConnectLedger ~ derivationPath:", derivationPath);

    //   const { publicKey, errorMessage, returnCode } = await stark.getPubKey(
    //     derivationPath,
    //     false
    //   );
    //   // console.log("🚀 ~ onConnectLedger ~ publicKey:", publicKey);

    //   const pubKey = encode.addHexPrefix(
    //     encode.buf2hex(publicKey.subarray(0, 32))
    //   );
    //   console.log("🚀 ~ onConnectLedger ~ pubKey:", pubKey);

    //   if (i === 0) {
    //     key = pubKey;
    //   }
    // }

    const { publicKey, errorMessage, returnCode } = await stark.getPubKey(
      STARKNET_DERIVATE_PATH + "/1",
      false,
    );

    console.log("🚀 ~ onConnectLedger ~ returnCodess:", returnCode);
    console.log("🚀 ~ onConnectLedger ~ errorMessage:", errorMessage);
    // convert uint8array to hex

    const pubKey = encode.addHexPrefix(
      encode.buf2hex(publicKey.subarray(0, 32)),
    );
    console.log("🚀 ~ onConnectLedger ~ pubKey:", pubKey);

    setStarkPublicKey(pubKey);
    // setAddress(publicKey);
    setStark(stark);

    const multisigPayload = getDeployAccountPayload(pubKey);

    const multisigAddress = hash.calculateContractAddressFromHash(
      multisigPayload.addressSalt!,
      multisigPayload.classHash,
      multisigPayload.constructorCalldata!,
      0,
    );

    setMultisigAddress(multisigAddress);
  };

  // const onConnectLedger = async () => {
  //   const transport = await TransportWebHID.create();

  //   const eth = new LedgerETH(transport);

  //   let ethAddress = "";

  //   for (let i = 0; i < 5; i++) {
  //     const { address } = await eth.getAddress(ETH_DERIVATE_PATH + "/" + i);
  //     console.log("🚀 ~ onConnectLedger ~ address:", address);
  //     // console.log("🚀 ~ onConnectLedger ~ publicKey:", publicKey);

  //     if (i === 0) {
  //       setEthPublicKey(address);
  //       ethAddress = address;
  //     }
  //   }

  //   const multisigPayload = getDeployAccountPayload(ethAddress);

  //   const multisigAddress = hash.calculateContractAddressFromHash(
  //     multisigPayload.addressSalt!,
  //     multisigPayload.classHash,
  //     multisigPayload.constructorCalldata!,
  //     0
  //   );

  //   setMultisigAddress(multisigAddress);
  // };

  const getDeployAccountPayload = (
    ethPubKey?: string,
    starkPubKey?: string,
  ) => {
    console.log("🚀 ~ Home ~ starkPubKey:", starkPubKey);
    return {
      classHash: MULTISIG_CLASS_HASH,
      constructorCalldata: CallData.compile({
        threshold: 1,
        // signers: [
        //   new CairoCustomEnum({
        //     Starknet: starkPubKey,
        //     Secp256k1: undefined,
        //     Secp256r1: undefined,
        //     Eip191: ethPubKey,
        //     Webauthn: undefined
        //   })
        // ] // Initial signers
        signers: [starkPubKey || ethPubKey],
      }),
      addressSalt: starkPubKey || ethPubKey,
    };
  };

  const deployAccountTx = async () => {
    let payload: DeployAccountContractPayload = getDeployAccountPayload(
      ethPublicKey,
      starkPublicKey,
    );

    payload = {
      ...payload,
      contractAddress: multisigAddress,
    };

    const signer = eth
      ? new MultisigEthSigner(eth, ETH_DERIVATE_PATH)
      : stark
        ? new MultisigStarknetSigner(stark, STARKNET_DERIVATE_PATH + "/1")
        : null;

    const rpcProvider = new RpcProvider({
      nodeUrl: "https://api.hydrogen.argent47.net/v1/starknet/sepolia/rpc/v0.6",
      chainId: constants.StarknetChainId.SN_SEPOLIA,
      headers: {
        "argent-version": process.env.VERSION || "Unknown version",
        "argent-client": "argent-x",
      },
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
        { skipValidate: true },
      );

      const response = await multisig.deployAccount(payload, {
        maxFee: suggestedMaxFee,
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
      calldata: [multisig.address, "1000", "0"],
    };

    const signer = eth
      ? new MultisigEthSigner(eth, ETH_DERIVATE_PATH)
      : stark
        ? new MultisigStarknetSigner(stark, STARKNET_DERIVATE_PATH + "/1")
        : null;

    if (!signer) {
      throw new Error("No signer found");
    }

    const { suggestedMaxFee } = await multisig.estimateInvokeFee(transferCall, {
      skipValidate: true,
    });
    console.log("🚀 ~ signTransaction ~ suggestedMaxFee:", suggestedMaxFee);

    const response = await multisig.execute(transferCall, undefined, {
      maxFee: suggestedMaxFee,
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
