var hedgehog = {
  network: "testnet",
  state: {
    channel_0: {
      alices_privkey: null,
      bobs_privkey: null,
      alices_pubkey: null,
      bobs_pubkey: null,
      scripts: [],
      trees: [],
      multisig_utxo_info: {},
      alice_should_reveal: false,
      bob_should_reveal: false,
      balances_according_to_alice: [],
      balances_according_to_bob: [],
      alices_offchain_tx_info: [],
      bobs_offchain_tx_info: [],
      alices_revocation_preimages: [],
      alices_revocation_hashes: [],
      bobs_revocation_preimages: [],
      bobs_revocation_hashes: [],
      txids_alice_watches_for: { order: [] },
      txids_bob_watches_for: { order: [] },
    },
  },
  hexToBytes: (hex) =>
    Uint8Array.from(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))),
  bytesToHex: (bytes) =>
    bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), ""),
  rmd160: (s) => {
    if (typeof s == "string") s = new TextEncoder().encode(s);
    var hash = RIPEMD160.create();
    hash.update(new Uint8Array(s));
    return hedgehog.bytesToHex(hash.digest());
  },
  getVin: (txid, vout, amnt, addy, sequence) => {
    var input = {
      txid,
      vout,
      prevout: {
        value: amnt,
        scriptPubKey: tapscript.Address.toScriptPubKey(addy),
      },
    };
    if (sequence) input["sequence"] = sequence;
    return input;
  },
  getVout: (amnt, addy) => ({
    value: amnt,
    scriptPubKey: tapscript.Address.toScriptPubKey(addy),
  }),
  makeAddress: (scripts) => {
    var tree = scripts.map((s) => tapscript.Tap.encodeScript(s));
    hedgehog.state["channel_0"].scripts.push(scripts);
    hedgehog.state["channel_0"].trees.push(tree);
    var pubkey = "ab".repeat(32);
    var [tpubkey] = tapscript.Tap.getPubKey(pubkey, { tree });
    return tapscript.Address.p2tr.fromPubKey(tpubkey, hedgehog.network);
  },
  find_latest_time_i_received: (user) => {
    if (user == "bob")
      var temp = [
        ...hedgehog.state["channel_0"].bobs_offchain_tx_info,
      ].reverse();
    else
      var temp = [
        ...hedgehog.state["channel_0"].alices_offchain_tx_info,
      ].reverse();
    var index_i_seek = -1;
    temp.every((item, index) => {
      if ("received" in item) {
        index_i_seek = index;
        return;
      }
      return true;
    });
    if (index_i_seek < 0) return -1;
    return temp.length - 1 - index_i_seek;
  },
  find_latest_time_i_sent: (user) => {
    if (user == "bob")
      var temp = [
        ...hedgehog.state["channel_0"].bobs_offchain_tx_info,
      ].reverse();
    else
      var temp = [
        ...hedgehog.state["channel_0"].alices_offchain_tx_info,
      ].reverse();
    var index_i_seek = -1;
    temp.every((item, index) => {
      if (!("received" in item)) {
        index_i_seek = index;
        return;
      }
      return true;
    });
    if (index_i_seek < 0) return -1;
    return temp.length - 1 - index_i_seek;
  },
  alices_revocation_script: (alices_revocation_hash) => [
    //TODO: change the 5 to a 2016
    [
      5,
      "OP_CHECKSEQUENCEVERIFY",
      "OP_DROP",
      hedgehog.state["channel_0"].alices_pubkey,
      "OP_CHECKSIG",
    ],
    [
      "OP_RIPEMD160",
      alices_revocation_hash,
      "OP_EQUALVERIFY",
      hedgehog.state["channel_0"].bobs_pubkey,
      "OP_CHECKSIG",
    ],
    [
      hedgehog.state["channel_0"].alices_pubkey,
      "OP_CHECKSIG",
      hedgehog.state["channel_0"].bobs_pubkey,
      "OP_CHECKSIGADD",
      2,
      "OP_EQUAL",
    ],
  ],
  bobs_revocation_script: (bobs_revocation_hash) => [
    //TODO: change the 5 to a 2016
    [
      5,
      "OP_CHECKSEQUENCEVERIFY",
      "OP_DROP",
      hedgehog.state["channel_0"].bobs_pubkey,
      "OP_CHECKSIG",
    ],
    [
      "OP_RIPEMD160",
      bobs_revocation_hash,
      "OP_EQUALVERIFY",
      hedgehog.state["channel_0"].alices_pubkey,
      "OP_CHECKSIG",
    ],
    [
      hedgehog.state["channel_0"].alices_pubkey,
      "OP_CHECKSIG",
      hedgehog.state["channel_0"].bobs_pubkey,
      "OP_CHECKSIGADD",
      2,
      "OP_EQUAL",
    ],
  ],
  alice_send: (amt_to_send, initialization) => {
    if (!amt_to_send)
      amt_to_send = Number(
        prompt(
          `This is the current state of the channel:\n\nAlice: ${hedgehog.state["channel_0"].balances_according_to_alice[0]} sats\nBob: ${hedgehog.state["channel_0"].balances_according_to_alice[1]} sats\n\nEnter an amount you want Alice to send to Bob`
        )
      );
    if (
      hedgehog.state["channel_0"].balances_according_to_alice[0] -
        amt_to_send -
        500 -
        500 <
      0
    )
      return alert(
        `you cannot send this amount, your remaining balance will be negative (accounting for 1000 sats in fees)! Send a smaller amount`
      );
    var conf;
    if (
      hedgehog.state["channel_0"].balances_according_to_alice[0] -
        amt_to_send -
        500 -
        500 <
        1330 &&
      !initialization
    )
      conf = confirm(
        `if you send this amount your remaining balance will be less than 1300 sats. If your balance is less than 1330 sats it is effectively zero due to force closure fees and the dust limit, so cancelling is recommended. Click cancel to cancel or click ok to proceed`
      );
    else conf = true;
    if (!conf) return;
    var zero_out_alices_balance;
    if (
      hedgehog.state["channel_0"].balances_according_to_alice[0] -
        amt_to_send -
        500 -
        500 <
      330
    )
      zero_out_alices_balance = true;
    var zero_out_bobs_balance;
    if (
      hedgehog.state["channel_0"].balances_according_to_alice[1] + amt_to_send <
      330
    )
      zero_out_bobs_balance = true;
    var txid = hedgehog.state["channel_0"].multisig_utxo_info["txid"];
    var vout = hedgehog.state["channel_0"].multisig_utxo_info["vout"];
    var amnt = hedgehog.state["channel_0"].multisig_utxo_info["amnt"];
    var reveal_secret = false;
    var alices_revocation_hash =
      hedgehog.state["channel_0"].alices_revocation_hashes[
        hedgehog.state["channel_0"].alices_revocation_hashes.length - 1
      ];
    var bobs_revocation_hash =
      hedgehog.state["channel_0"].bobs_revocation_hashes[
        hedgehog.state["channel_0"].bobs_revocation_hashes.length - 1
      ];
    //a user does not need to reveal their secret if they haven't received any money
    //because revealing their secret revokes their ability to safely receive money
    //in a given state, and if they haven't received money in the current state,
    //they should not revoke their ability to do so.
    if (hedgehog.find_latest_time_i_received("alice") > -1)
      reveal_secret = true;
    if (reveal_secret) {
      var secret_to_reveal =
        hedgehog.state["channel_0"].alices_revocation_preimages[
          hedgehog.state["channel_0"].alices_revocation_preimages.length - 2
        ];
      var alices_new_secret = hedgehog
        .bytesToHex(nobleSecp256k1.utils.randomPrivateKey())
        .substring(0, 32);
      alices_revocation_hash = hedgehog.rmd160(
        hedgehog.hexToBytes(alices_new_secret)
      );
      hedgehog.state["channel_0"].alices_revocation_preimages.push(
        alices_new_secret
      );
      hedgehog.state["channel_0"].alices_revocation_hashes.push(
        alices_revocation_hash
      );
    }
    var scripts = hedgehog.bobs_revocation_script(bobs_revocation_hash);
    var revocable = hedgehog.makeAddress(scripts);
    var tree = scripts.map((s) => tapscript.Tap.encodeScript(s));
    var txdata = tapscript.Tx.create({
      vin: [
        hedgehog.getVin(txid, vout, amnt, hedgehog.state["channel_0"].multisig),
      ],
      vout: [
        hedgehog.getVout(
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_alice
        ),
        hedgehog.getVout(330, revocable),
      ],
    });
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[0][0]
    );
    var sig_1 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].alices_privkey,
      txdata,
      0,
      { extension: target }
    ).hex;
    var offchain_txid = tapscript.Tx.util.getTxid(txdata);
    {
      var to_bob = tapscript.Address.fromScriptPubKey([
        "OP_1",
        hedgehog.state["channel_0"].bobs_pubkey,
      ]);
      var alices_alt_hash = reveal_secret
        ? hedgehog.state["channel_0"].alices_revocation_hashes[
            hedgehog.state["channel_0"].alices_revocation_hashes.length - 2
          ]
        : alices_revocation_hash;
      var alt_revocable_scripts =
        hedgehog.alices_revocation_script(alices_alt_hash);
      var alt_revocable = hedgehog.makeAddress(alt_revocable_scripts);
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            txid,
            vout,
            amnt,
            hedgehog.state["channel_0"].multisig
          ),
        ],
        vout: [
          hedgehog.getVout(
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_bob
          ),
          hedgehog.getVout(330, alt_revocable),
        ],
      });
      var alt_txid = tapscript.Tx.util.getTxid(txdata);
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            alt_txid,
            0,
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_bob
          ),
          hedgehog.getVin(alt_txid, 1, 330, alt_revocable),
        ],
        vout: [hedgehog.getVout(amnt - 330 - 500, to_bob)],
      });
      var penalty_target = tapscript.Tap.encodeScript(
        hedgehog.state["channel_0"].scripts[2][0]
      );
      var penalty_sig = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].alices_privkey,
        txdata,
        0,
        { extension: penalty_target }
      ).hex;
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            alt_txid,
            0,
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_bob
          ),
          hedgehog.getVin(alt_txid, 1, 330, alt_revocable),
        ],
        vout: [
          hedgehog.getVout(
            hedgehog.state["channel_0"].balances_according_to_alice[0] -
              amt_to_send -
              500 -
              500,
            hedgehog.state["channel_0"].alices_address
          ),
          hedgehog.getVout(
            hedgehog.state["channel_0"].balances_according_to_alice[1] +
              amt_to_send,
            hedgehog.state["channel_0"].bobs_address
          ),
        ],
      });
      var force_close_sig_1 = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].alices_privkey,
        txdata,
        0,
        { extension: penalty_target }
      ).hex;
      var penalty_target_2 = tapscript.Tap.encodeScript(
        hedgehog.state["channel_0"].scripts[
          hedgehog.state["channel_0"].scripts.length - 1
        ][2]
      );
      var force_close_sig_2 = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].alices_privkey,
        txdata,
        1,
        { extension: penalty_target_2 }
      ).hex;
    }
    var prep_tx = {
      vin: [
        hedgehog.getVin(
          offchain_txid,
          0,
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_alice
        ),
        //TODO: change the 5 to a 2016
        hedgehog.getVin(offchain_txid, 1, 330, revocable, 5),
      ],
      vout: [
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_alice[0] -
            amt_to_send -
            500 -
            500,
          hedgehog.state["channel_0"].alices_address
        ),
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_alice[1] +
            amt_to_send,
          hedgehog.state["channel_0"].bobs_address
        ),
      ],
    };
    if (zero_out_alices_balance) prep_tx["vout"].splice(0, 1);
    if (zero_out_bobs_balance) prep_tx["vout"].splice(1, 1);
    var txdata = tapscript.Tx.create(prep_tx);
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[1][0]
    );
    var tree_2 = hedgehog.state["channel_0"].trees[1];
    var [tpubkey, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree: tree_2,
      target,
    });
    var sig_3 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].alices_privkey,
      txdata,
      0,
      { extension: target }
    ).hex;
    hedgehog.state["channel_0"].alices_offchain_tx_info.push({
      sig_1,
      penalty_sig,
      sig_3,
      amt_to_send,
      alices_revocation_hash,
      scripts,
      trees: [tree],
    });
    var tree = tree_2;
    if (reveal_secret) {
      if (hedgehog.state["channel_0"].alice_should_reveal)
        hedgehog.state["channel_0"].alices_offchain_tx_info[
          hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
        ]["secret"] = secret_to_reveal;
      else hedgehog.state["channel_0"].alice_should_reveal = true;
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
      ]["force_close_sig_1"] = force_close_sig_1;
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
      ]["force_close_sig_2"] = force_close_sig_2;
    }
    var temp = JSON.parse(
      JSON.stringify(
        hedgehog.state["channel_0"].alices_offchain_tx_info[
          hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
        ]
      )
    );
    delete temp.scripts;
    delete temp.trees;
    console.log(JSON.stringify(temp));
    hedgehog.state["channel_0"].balances_according_to_alice = [
      hedgehog.state["channel_0"].balances_according_to_alice[0] - amt_to_send,
      hedgehog.state["channel_0"].balances_according_to_alice[1] + amt_to_send,
    ];
    var msg = `Alice should now send Bob sig_1, sig_3, the amount she sent him, and a hash she wants him to use in his next payment to her. This info is in your console. Enter the command 'hedgehog.bob_receive()' in his browser console to simulate Bob accepting this payment.`;
    if (initialization)
      msg = `To initialize the channel, send Bob the info in your console`;
    alert(msg);
  },
  bob_receive: async (initialization) => {
    var alices_info = JSON.parse(prompt(`Enter the info from Alice`));
    var msg = `Click ok to receive ${alices_info["amt_to_send"]} sats from Alice`;
    if (
      hedgehog.state["channel_0"].balances_according_to_bob[1] +
        alices_info["amt_to_send"] <
      1330
    )
      msg += `. Note that this will only bring your balance up to ${
        hedgehog.state["channel_0"].balances_according_to_bob[1] +
        alices_info["amt_to_send"]
      } sats, which is less than 1330. If your balance is less than 1330 sats it is effectively zero due to force closure fees and the dust limit, so cancelling is recommended`;
    var conf;
    if (
      alices_info["amt_to_send"] &&
      typeof alices_info["amt_to_send"] == "number" &&
      alices_info["amt_to_send"] > 0 &&
      hedgehog.state["channel_0"].balances_according_to_bob[0] -
        alices_info["amt_to_send"] -
        500 -
        500 >=
        0 &&
      !initialization
    )
      conf = confirm(msg);
    else conf = true;
    if (!conf) return;
    var zero_out_alices_balance;
    if (
      hedgehog.state["channel_0"].balances_according_to_bob[0] -
        alices_info["amt_to_send"] -
        500 -
        500 <
      330
    )
      zero_out_alices_balance = true;
    var zero_out_bobs_balance;
    if (
      hedgehog.state["channel_0"].balances_according_to_bob[1] +
        alices_info["amt_to_send"] <
      330
    )
      zero_out_bobs_balance = true;
    hedgehog.state["channel_0"].bobs_offchain_tx_info.push(alices_info);
    hedgehog.state["channel_0"].bobs_offchain_tx_info[
      hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
    ]["received"] = true;
    var txid = hedgehog.state["channel_0"].multisig_utxo_info["txid"];
    var vout = hedgehog.state["channel_0"].multisig_utxo_info["vout"];
    var amnt = hedgehog.state["channel_0"].multisig_utxo_info["amnt"];
    if (hedgehog.state["channel_0"].alice_should_reveal)
      var alices_previous_revocation_hash =
        hedgehog.state["channel_0"].alices_revocation_hashes[
          hedgehog.state["channel_0"].alices_revocation_hashes.length - 2
        ];
    else var alices_previous_revocation_hash;
    var alices_revocation_hash =
      hedgehog.state["channel_0"].alices_revocation_hashes[
        hedgehog.state["channel_0"].alices_revocation_hashes.length - 1
      ];
    var bobs_revocation_hash =
      hedgehog.state["channel_0"].bobs_revocation_hashes[
        hedgehog.state["channel_0"].bobs_revocation_hashes.length - 1
      ];
    var scripts = hedgehog.bobs_revocation_script(bobs_revocation_hash);
    var revocable = hedgehog.makeAddress(scripts);
    var tree = scripts.map((s) => tapscript.Tap.encodeScript(s));
    hedgehog.state["channel_0"].bobs_offchain_tx_info[
      hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
    ]["scripts"] = scripts;
    hedgehog.state["channel_0"].bobs_offchain_tx_info[
      hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
    ]["trees"] = [tree];
    var txdata = tapscript.Tx.create({
      vin: [
        hedgehog.getVin(txid, vout, amnt, hedgehog.state["channel_0"].multisig),
      ],
      vout: [
        hedgehog.getVout(
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_alice
        ),
        hedgehog.getVout(330, revocable),
      ],
    });
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[0][0]
    );
    var tree = hedgehog.state["channel_0"].trees[0];
    var sig_1 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
      ]["sig_1"];
    var sighash = tapscript.Signer.taproot.hash(txdata, 0, {
      extension: target,
    }).hex;
    var sig_is_valid = await nobleSecp256k1.schnorr.verify(
      sig_1,
      sighash,
      hedgehog.state["channel_0"].alices_pubkey
    );
    if (!sig_is_valid) {
      alert(`nevermind, sig_1 was invalid`);
      return hedgehog.state["channel_0"].bobs_offchain_tx_info.splice(
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1,
        1
      );
    }
    var sig_2 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].bobs_privkey,
      txdata,
      0,
      { extension: target }
    ).hex;
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree,
      target,
    });
    txdata.vin[0].witness = [
      sig_2,
      sig_1,
      hedgehog.state["channel_0"].scripts[0][0],
      cblock,
    ];
    var txhex = tapscript.Tx.encode(txdata).hex;
    var offchain_txid = tapscript.Tx.util.getTxid(txdata);
    var alice_must_reveal_secret = false;
    if (hedgehog.find_latest_time_i_sent("bob") > -1)
      alice_must_reveal_secret = true;
    var amt_to_send =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
      ]["amt_to_send"];
    {
      var to_bob = tapscript.Address.fromScriptPubKey([
        "OP_1",
        hedgehog.state["channel_0"].bobs_pubkey,
      ]);
      var alt_revocable_scripts = hedgehog.alices_revocation_script(
        alices_revocation_hash
      );
      var alt_revocable = hedgehog.makeAddress(alt_revocable_scripts);
      var alt_target = tapscript.Tap.encodeScript(alt_revocable_scripts[1]);
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            txid,
            vout,
            amnt,
            hedgehog.state["channel_0"].multisig
          ),
        ],
        vout: [
          hedgehog.getVout(
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_bob
          ),
          hedgehog.getVout(330, alt_revocable),
        ],
      });
      var alt_txid = tapscript.Tx.util.getTxid(txdata);
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            alt_txid,
            0,
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_bob
          ),
          hedgehog.getVin(alt_txid, 1, 330, alt_revocable),
        ],
        vout: [hedgehog.getVout(amnt - 330 - 500, to_bob)],
      });
      var penalty_target = tapscript.Tap.encodeScript(
        hedgehog.state["channel_0"].scripts[2][0]
      );
      var penalty_sig =
        hedgehog.state["channel_0"].bobs_offchain_tx_info[
          hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
        ]["penalty_sig"];
      var sighash = tapscript.Signer.taproot.hash(txdata, 0, {
        extension: penalty_target,
      }).hex;
      var sig_is_valid = await nobleSecp256k1.schnorr.verify(
        penalty_sig,
        sighash,
        hedgehog.state["channel_0"].alices_pubkey
      );
      if (!sig_is_valid) {
        alert(`nevermind, the penalty_sig was invalid`);
        return hedgehog.state["channel_0"].bobs_offchain_tx_info.splice(
          hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1,
          1
        );
      }
      var penalty_sig_2 = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].bobs_privkey,
        txdata,
        0,
        { extension: penalty_target }
      ).hex;
      var penalty_sig_3 = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].bobs_privkey,
        txdata,
        1,
        { extension: alt_target }
      ).hex;
      if (alice_must_reveal_secret) {
        var txdata = tapscript.Tx.create({
          vin: [
            hedgehog.getVin(
              alt_txid,
              0,
              amnt - 330 - 500,
              hedgehog.state["channel_0"].multisig_or_bob
            ),
            hedgehog.getVin(alt_txid, 1, 330, alt_revocable),
          ],
          vout: [
            hedgehog.getVout(
              hedgehog.state["channel_0"].balances_according_to_bob[0] -
                amt_to_send -
                500 -
                500,
              hedgehog.state["channel_0"].alices_address
            ),
            hedgehog.getVout(
              hedgehog.state["channel_0"].balances_according_to_bob[1] +
                amt_to_send,
              hedgehog.state["channel_0"].bobs_address
            ),
          ],
        });
        var force_close_sig_1 =
          hedgehog.state["channel_0"].bobs_offchain_tx_info[
            hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
          ]["force_close_sig_1"];
        var force_close_sig_2 =
          hedgehog.state["channel_0"].bobs_offchain_tx_info[
            hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
          ]["force_close_sig_2"];
        var sighash = tapscript.Signer.taproot.hash(txdata, 0, {
          extension: penalty_target,
        }).hex;
        var sig_is_valid = await nobleSecp256k1.schnorr.verify(
          force_close_sig_1,
          sighash,
          hedgehog.state["channel_0"].alices_pubkey
        );
        if (!sig_is_valid) {
          alert(`nevermind, force_close_sig_1 was invalid`);
          return hedgehog.state["channel_0"].bobs_offchain_tx_info.splice(
            hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1,
            1
          );
        }
        var penalty_target_2 = tapscript.Tap.encodeScript(
          hedgehog.state["channel_0"].scripts[
            hedgehog.state["channel_0"].scripts.length - 1
          ][2]
        );
        var sighash = tapscript.Signer.taproot.hash(txdata, 1, {
          extension: penalty_target_2,
        }).hex;
        var sig_is_valid = await nobleSecp256k1.schnorr.verify(
          force_close_sig_2,
          sighash,
          hedgehog.state["channel_0"].alices_pubkey
        );
        if (!sig_is_valid) {
          alert(`nevermind, force_close_sig_2 was invalid`);
          return hedgehog.state["channel_0"].bobs_offchain_tx_info.splice(
            hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1,
            1
          );
        }
        var force_close_sig_3 = tapscript.Signer.taproot.sign(
          hedgehog.state["channel_0"].bobs_privkey,
          txdata,
          0,
          { extension: penalty_target }
        ).hex;
        var force_close_sig_4 = tapscript.Signer.taproot.sign(
          hedgehog.state["channel_0"].bobs_privkey,
          txdata,
          1,
          { extension: penalty_target_2 }
        ).hex;
      }
      var latest_time_i_sent = hedgehog.find_latest_time_i_sent("bob");
      if (latest_time_i_sent > -1) {
        hedgehog.state["channel_0"].bobs_offchain_tx_info[latest_time_i_sent][
          "penalty_sig"
        ] = penalty_sig;
        hedgehog.state["channel_0"].bobs_offchain_tx_info[latest_time_i_sent][
          "penalty_sig_2"
        ] = penalty_sig_2;
        hedgehog.state["channel_0"].bobs_offchain_tx_info[latest_time_i_sent][
          "penalty_sig_3"
        ] = penalty_sig_3;
        if (alice_must_reveal_secret)
          hedgehog.state["channel_0"].bobs_offchain_tx_info[latest_time_i_sent][
            "force_close_sig_1"
          ] = force_close_sig_1;
        if (alice_must_reveal_secret)
          hedgehog.state["channel_0"].bobs_offchain_tx_info[latest_time_i_sent][
            "force_close_sig_2"
          ] = force_close_sig_2;
        if (alice_must_reveal_secret)
          hedgehog.state["channel_0"].bobs_offchain_tx_info[latest_time_i_sent][
            "force_close_sig_3"
          ] = force_close_sig_3;
        if (alice_must_reveal_secret)
          hedgehog.state["channel_0"].bobs_offchain_tx_info[latest_time_i_sent][
            "force_close_sig_4"
          ] = force_close_sig_4;
      }
    }
    if (
      (alice_must_reveal_secret &&
        hedgehog.state["channel_0"].alice_should_reveal &&
        !alices_info["secret"]) ||
      (alice_must_reveal_secret &&
        alices_info["secret"] &&
        hedgehog.rmd160(hedgehog.hexToBytes(alices_info["secret"])) !=
          alices_previous_revocation_hash)
    ) {
      alert(`nevermind, Alice didn't reveal her secret`);
      return hedgehog.state["channel_0"].bobs_offchain_tx_info.splice(
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1,
        1
      );
    }
    if (alice_must_reveal_secret) {
      var past_scripts =
        hedgehog.state["channel_0"].bobs_offchain_tx_info[
          hedgehog.find_latest_time_i_sent("bob")
        ]["scripts"];
      var past_revocable = hedgehog.makeAddress(past_scripts);
      var past_tx = {
        vin: [
          hedgehog.getVin(
            txid,
            vout,
            amnt,
            hedgehog.state["channel_0"].multisig
          ),
        ],
        vout: [
          hedgehog.getVout(
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_bob
          ),
          hedgehog.getVout(330, past_revocable),
        ],
      };
      var past_txdata = tapscript.Tx.create(past_tx);
      var past_txid = tapscript.Tx.util.getTxid(past_txdata);
      var prev_txid =
        hedgehog.state["channel_0"].txids_bob_watches_for["order"][
          hedgehog.state["channel_0"].txids_bob_watches_for["order"].length - 1
        ];
      if (
        "secret" in alices_info &&
        hedgehog.state["channel_0"].alice_should_reveal
      )
        hedgehog.state["channel_0"].txids_bob_watches_for[prev_txid]["secret"] =
          alices_info["secret"];
      if (
        !hedgehog.state["channel_0"].alice_should_reveal &&
        alice_must_reveal_secret
      )
        hedgehog.state["channel_0"].alice_should_reveal = true;
      hedgehog.state["channel_0"].txids_bob_watches_for["order"].push(
        past_txid
      );
      hedgehog.state["channel_0"].txids_bob_watches_for[past_txid] = {
        secret: "",
        past_tx,
        index_of_tx_info_containing_recovery_scripts:
          hedgehog.find_latest_time_i_sent("bob"),
      };
      hedgehog.state["channel_0"].alices_revocation_hashes.push(
        alices_info["alices_revocation_hash"]
      );
    }
    var prep_tx = {
      vin: [
        hedgehog.getVin(
          offchain_txid,
          0,
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_alice
        ),
        //TODO: change the 5 to a 2016
        hedgehog.getVin(offchain_txid, 1, 330, revocable, 5),
      ],
      vout: [
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_bob[0] -
            amt_to_send -
            500 -
            500,
          hedgehog.state["channel_0"].alices_address
        ),
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_bob[1] +
            amt_to_send,
          hedgehog.state["channel_0"].bobs_address
        ),
      ],
    };
    if (zero_out_alices_balance) prep_tx["vout"].splice(0, 1);
    if (zero_out_bobs_balance) prep_tx["vout"].splice(1, 1);
    var txdata = tapscript.Tx.create(prep_tx);
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[1][0]
    );
    var tree = hedgehog.state["channel_0"].trees[1];
    var [tpubkey, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree,
      target,
    });
    var sig_3 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
      ]["sig_3"];
    var sighash = tapscript.Signer.taproot.hash(txdata, 0, {
      extension: target,
    }).hex;
    var sig_is_valid = await nobleSecp256k1.schnorr.verify(
      sig_3,
      sighash,
      hedgehog.state["channel_0"].alices_pubkey
    );
    if (!sig_is_valid) {
      alert(`nevermind, sig_3 was invalid`);
      return hedgehog.state["channel_0"].bobs_offchain_tx_info.splice(
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1,
        1
      );
    }
    var sig_4 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].bobs_privkey,
      txdata,
      0,
      { extension: target }
    ).hex;
    txdata.vin[0].witness = [
      sig_4,
      sig_3,
      hedgehog.state["channel_0"].scripts[0][0],
      cblock,
    ];
    //TODO: fix this part -- the script will be #1 the first time
    //you send but after that I think it depends on who is sending
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
      ]["scripts"][0]
    );
    var tree =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
      ]["trees"][0];
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree,
      target,
    });
    var sig_5 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].bobs_privkey,
      txdata,
      1,
      { extension: target }
    ).hex;
    //the script is supposed to come from the ones I made when I ran makeAddress to make the revocable address.
    //So I used to say here to get the script from hedgehog.state[ "channel_0" ].scripts[ hedgehog.state[ "channel_0" ].scripts.length - 1 ][ 0 ]. But now
    //I call makeAddress 1 or 2 times after that, depending on whether Alice reveals her secret or not.
    //So I define an offset of 2 and if Alice revealed her secret then I increment it by 1, then get the
    //script from there
    var offset = 2;
    if (alice_must_reveal_secret) offset = offset + 1;
    txdata.vin[1].witness = [
      sig_5,
      hedgehog.state["channel_0"].scripts[
        hedgehog.state["channel_0"].scripts.length - offset
      ][0],
      cblock,
    ];
    hedgehog.state["channel_0"].balances_according_to_bob = [
      hedgehog.state["channel_0"].balances_according_to_bob[0] - amt_to_send,
      hedgehog.state["channel_0"].balances_according_to_bob[1] + amt_to_send,
    ];
    hedgehog.state["channel_0"].bobs_offchain_tx_info[
      hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
    ]["tx1"] = txhex;
    var txhex = tapscript.Tx.encode(txdata).hex;
    hedgehog.state["channel_0"].bobs_offchain_tx_info[
      hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
    ]["tx2"] = txhex;
    if (!initialization)
      alert(
        `Enter the command 'hedgehog.bob_close()' in your browser console to close the channel with this state:\n\nAlice: ${hedgehog.state["channel_0"].balances_according_to_bob[0]} sats\nBob: ${hedgehog.state["channel_0"].balances_according_to_bob[1]} sats`
      );
  },
  bob_close: () => {
    console.log(`broadcast this:`);
    console.log(
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.find_latest_time_i_received("bob")
      ]["tx1"]
    );
    //TODO: change the 5 to a 2016
    console.log(`broadcast this after 5 blocks:`);
    console.log(
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.find_latest_time_i_received("bob")
      ]["tx2"]
    );
  },
  bob_send: (amt_to_send, initialization) => {
    if (!amt_to_send)
      amt_to_send = Number(
        prompt(
          `This is the current state of the channel:\n\nAlice: ${hedgehog.state["channel_0"].balances_according_to_bob[0]} sats\nBob: ${hedgehog.state["channel_0"].balances_according_to_bob[1]} sats\n\nEnter an amount you want Bob to send to Alice`
        )
      );
    if (
      hedgehog.state["channel_0"].balances_according_to_bob[1] -
        amt_to_send -
        500 -
        500 <
      0
    )
      return alert(
        `you cannot send this amount, your remaining balance will be negative (accounting for 1000 sats in fees)! Send a smaller amount`
      );
    var conf;
    if (
      hedgehog.state["channel_0"].balances_according_to_bob[1] -
        amt_to_send -
        500 -
        500 <
        1330 &&
      !initialization
    )
      conf = confirm(
        `if you send this amount your remaining balance will be less than 1300 sats. If your balance is less than 1330 sats it is effectively zero due to force closure fees and the dust limit, so cancelling is recommended. Click cancel to cancel or click ok to proceed`
      );
    else conf = true;
    if (!conf) return;
    var zero_out_alices_balance;
    if (
      hedgehog.state["channel_0"].balances_according_to_bob[0] + amt_to_send <
      330
    )
      zero_out_alices_balance = true;
    var zero_out_bobs_balance;
    if (
      hedgehog.state["channel_0"].balances_according_to_bob[1] -
        amt_to_send -
        500 -
        500 <
      330
    )
      zero_out_bobs_balance = true;
    var txid = hedgehog.state["channel_0"].multisig_utxo_info["txid"];
    var vout = hedgehog.state["channel_0"].multisig_utxo_info["vout"];
    var amnt = hedgehog.state["channel_0"].multisig_utxo_info["amnt"];
    var reveal_secret = false;
    var alices_revocation_hash =
      hedgehog.state["channel_0"].alices_revocation_hashes[
        hedgehog.state["channel_0"].alices_revocation_hashes.length - 1
      ];
    var bobs_revocation_hash =
      hedgehog.state["channel_0"].bobs_revocation_hashes[
        hedgehog.state["channel_0"].bobs_revocation_hashes.length - 1
      ];
    //a user does not need to reveal their secret if they haven't received any money
    //because revealing their secret revokes their ability to safely receive money
    //in a given state, and if they haven't received money in the current state,
    //they should not revoke their ability to do so.
    if (hedgehog.find_latest_time_i_received("bob") > -1) reveal_secret = true;
    if (reveal_secret) {
      var secret_to_reveal =
        hedgehog.state["channel_0"].bobs_revocation_preimages[
          hedgehog.state["channel_0"].bobs_revocation_preimages.length - 2
        ];
      var bobs_new_secret = hedgehog
        .bytesToHex(nobleSecp256k1.utils.randomPrivateKey())
        .substring(0, 32);
      bobs_revocation_hash = hedgehog.rmd160(
        hedgehog.hexToBytes(bobs_new_secret)
      );
      hedgehog.state["channel_0"].bobs_revocation_preimages.push(
        bobs_new_secret
      );
      hedgehog.state["channel_0"].bobs_revocation_hashes.push(
        bobs_revocation_hash
      );
    }
    var scripts = hedgehog.alices_revocation_script(alices_revocation_hash);
    var revocable = hedgehog.makeAddress(scripts);
    var tree = scripts.map((s) => tapscript.Tap.encodeScript(s));
    var txdata = tapscript.Tx.create({
      vin: [
        hedgehog.getVin(txid, vout, amnt, hedgehog.state["channel_0"].multisig),
      ],
      vout: [
        hedgehog.getVout(
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_bob
        ),
        hedgehog.getVout(330, revocable),
      ],
    });
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[0][0]
    );
    var sig_1 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].bobs_privkey,
      txdata,
      0,
      { extension: target }
    ).hex;
    var offchain_txid = tapscript.Tx.util.getTxid(txdata);
    {
      var to_alice = tapscript.Address.fromScriptPubKey([
        "OP_1",
        hedgehog.state["channel_0"].alices_pubkey,
      ]);
      var bobs_alt_hash = reveal_secret
        ? hedgehog.state["channel_0"].bobs_revocation_hashes[
            hedgehog.state["channel_0"].bobs_revocation_hashes.length - 2
          ]
        : bobs_revocation_hash;
      var alt_revocable_scripts =
        hedgehog.bobs_revocation_script(bobs_alt_hash);
      var alt_revocable = hedgehog.makeAddress(alt_revocable_scripts);
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            txid,
            vout,
            amnt,
            hedgehog.state["channel_0"].multisig
          ),
        ],
        vout: [
          hedgehog.getVout(
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_alice
          ),
          hedgehog.getVout(330, alt_revocable),
        ],
      });
      var alt_txid = tapscript.Tx.util.getTxid(txdata);
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            alt_txid,
            0,
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_alice
          ),
          hedgehog.getVin(alt_txid, 1, 330, alt_revocable),
        ],
        vout: [hedgehog.getVout(amnt - 330 - 500, to_alice)],
      });
      var penalty_target = tapscript.Tap.encodeScript(
        hedgehog.state["channel_0"].scripts[1][0]
      );
      var penalty_sig = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].bobs_privkey,
        txdata,
        0,
        { extension: penalty_target }
      ).hex;
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            alt_txid,
            0,
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_alice
          ),
          hedgehog.getVin(alt_txid, 1, 330, alt_revocable),
        ],
        vout: [
          hedgehog.getVout(
            hedgehog.state["channel_0"].balances_according_to_bob[0] +
              amt_to_send,
            hedgehog.state["channel_0"].alices_address
          ),
          hedgehog.getVout(
            hedgehog.state["channel_0"].balances_according_to_bob[1] -
              amt_to_send -
              500 -
              500,
            hedgehog.state["channel_0"].bobs_address
          ),
        ],
      });
      var force_close_sig_1 = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].bobs_privkey,
        txdata,
        0,
        { extension: penalty_target }
      ).hex;
      var penalty_target_2 = tapscript.Tap.encodeScript(
        hedgehog.state["channel_0"].scripts[
          hedgehog.state["channel_0"].scripts.length - 1
        ][2]
      );
      var force_close_sig_2 = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].bobs_privkey,
        txdata,
        1,
        { extension: penalty_target_2 }
      ).hex;
    }
    var prep_tx = {
      vin: [
        hedgehog.getVin(
          offchain_txid,
          0,
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_bob
        ),
        //TODO: change the 5 to a 2016
        hedgehog.getVin(offchain_txid, 1, 330, revocable, 5),
      ],
      vout: [
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_bob[0] +
            amt_to_send,
          hedgehog.state["channel_0"].alices_address
        ),
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_bob[1] -
            amt_to_send -
            500 -
            500,
          hedgehog.state["channel_0"].bobs_address
        ),
      ],
    };
    if (zero_out_alices_balance) prep_tx["vout"].splice(0, 1);
    if (zero_out_bobs_balance) prep_tx["vout"].splice(1, 1);
    var txdata = tapscript.Tx.create(prep_tx);
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[2][0]
    );
    var tree_2 = hedgehog.state["channel_0"].trees[2];
    var [tpubkey, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree: tree_2,
      target,
    });
    var sig_3 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].bobs_privkey,
      txdata,
      0,
      { extension: target }
    ).hex;
    hedgehog.state["channel_0"].bobs_offchain_tx_info.push({
      sig_1,
      penalty_sig,
      sig_3,
      amt_to_send,
      bobs_revocation_hash,
      scripts,
      trees: [tree],
    });
    var tree = tree_2;
    if (reveal_secret) {
      if (hedgehog.state["channel_0"].bob_should_reveal)
        hedgehog.state["channel_0"].bobs_offchain_tx_info[
          hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
        ]["secret"] = secret_to_reveal;
      else hedgehog.state["channel_0"].bob_should_reveal = true;
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
      ]["force_close_sig_1"] = force_close_sig_1;
      hedgehog.state["channel_0"].bobs_offchain_tx_info[
        hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
      ]["force_close_sig_2"] = force_close_sig_2;
    }
    var temp = JSON.parse(
      JSON.stringify(
        hedgehog.state["channel_0"].bobs_offchain_tx_info[
          hedgehog.state["channel_0"].bobs_offchain_tx_info.length - 1
        ]
      )
    );
    delete temp.scripts;
    delete temp.trees;
    console.log(JSON.stringify(temp));
    hedgehog.state["channel_0"].balances_according_to_bob = [
      hedgehog.state["channel_0"].balances_according_to_bob[0] + amt_to_send,
      hedgehog.state["channel_0"].balances_according_to_bob[1] - amt_to_send,
    ];
    var msg = `Bob should now send Alice sig_1, sig_3, the amount he sent her, and a hash he wants her to use in her next payment to him. This info is in your console. Enter the command 'hedgehog.alice_receive()' in her browser console to simulate Alice accepting this payment.`;
    if (initialization)
      msg = `To initialize the channel, send Alice the info in your console`;
    alert(msg);
  },
  alice_receive: async (initialization) => {
    var bobs_info = JSON.parse(prompt(`Enter the info from Bob`));
    var msg = `Click ok to receive ${bobs_info["amt_to_send"]} sats from Bob`;
    if (
      hedgehog.state["channel_0"].balances_according_to_alice[0] +
        bobs_info["amt_to_send"] <
      1330
    )
      msg += `. Note that this will only bring your balance up to ${
        hedgehog.state["channel_0"].balances_according_to_alice[0] +
        bobs_info["amt_to_send"]
      } sats, which is less than 1330. If your balance is less than 1330 sats it is effectively zero due to force closure fees and the dust limit, so cancelling is recommended`;
    var conf;
    if (
      bobs_info["amt_to_send"] &&
      typeof bobs_info["amt_to_send"] == "number" &&
      bobs_info["amt_to_send"] > 0 &&
      hedgehog.state["channel_0"].balances_according_to_alice[1] -
        bobs_info["amt_to_send"] -
        500 -
        500 >=
        0 &&
      !initialization
    )
      conf = confirm(msg);
    else conf = true;
    if (!conf) return;
    var zero_out_alices_balance;
    if (
      hedgehog.state["channel_0"].balances_according_to_alice[0] +
        bobs_info["amt_to_send"] <
      330
    )
      zero_out_alices_balance = true;
    var zero_out_bobs_balance;
    if (
      hedgehog.state["channel_0"].balances_according_to_alice[1] -
        bobs_info["amt_to_send"] -
        500 -
        500 <
      330
    )
      zero_out_bobs_balance = true;
    hedgehog.state["channel_0"].alices_offchain_tx_info.push(bobs_info);
    hedgehog.state["channel_0"].alices_offchain_tx_info[
      hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
    ]["received"] = true;
    var txid = hedgehog.state["channel_0"].multisig_utxo_info["txid"];
    var vout = hedgehog.state["channel_0"].multisig_utxo_info["vout"];
    var amnt = hedgehog.state["channel_0"].multisig_utxo_info["amnt"];
    if (hedgehog.state["channel_0"].bob_should_reveal)
      var bobs_previous_revocation_hash =
        hedgehog.state["channel_0"].bobs_revocation_hashes[
          hedgehog.state["channel_0"].bobs_revocation_hashes.length - 2
        ];
    else var bobs_previous_revocation_hash;
    var alices_revocation_hash =
      hedgehog.state["channel_0"].alices_revocation_hashes[
        hedgehog.state["channel_0"].alices_revocation_hashes.length - 1
      ];
    var bobs_revocation_hash =
      hedgehog.state["channel_0"].bobs_revocation_hashes[
        hedgehog.state["channel_0"].bobs_revocation_hashes.length - 1
      ];
    var scripts = hedgehog.alices_revocation_script(alices_revocation_hash);
    var revocable = hedgehog.makeAddress(scripts);
    var tree = scripts.map((s) => tapscript.Tap.encodeScript(s));
    hedgehog.state["channel_0"].alices_offchain_tx_info[
      hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
    ]["scripts"] = scripts;
    hedgehog.state["channel_0"].alices_offchain_tx_info[
      hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
    ]["trees"] = [tree];
    var txdata = tapscript.Tx.create({
      vin: [
        hedgehog.getVin(txid, vout, amnt, hedgehog.state["channel_0"].multisig),
      ],
      vout: [
        hedgehog.getVout(
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_bob
        ),
        hedgehog.getVout(330, revocable),
      ],
    });
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[0][0]
    );
    var tree = hedgehog.state["channel_0"].trees[0];
    var sig_1 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
      ]["sig_1"];
    var sighash = tapscript.Signer.taproot.hash(txdata, 0, {
      extension: target,
    }).hex;
    var sig_is_valid = await nobleSecp256k1.schnorr.verify(
      sig_1,
      sighash,
      hedgehog.state["channel_0"].bobs_pubkey
    );
    if (!sig_is_valid) {
      alert(`nevermind, sig_1 was invalid`);
      return hedgehog.state["channel_0"].alices_offchain_tx_info.splice(
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1,
        1
      );
    }
    var sig_2 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].alices_privkey,
      txdata,
      0,
      { extension: target }
    ).hex;
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree,
      target,
    });
    txdata.vin[0].witness = [
      sig_1,
      sig_2,
      hedgehog.state["channel_0"].scripts[0][0],
      cblock,
    ];
    var txhex = tapscript.Tx.encode(txdata).hex;
    var offchain_txid = tapscript.Tx.util.getTxid(txdata);
    var bob_must_reveal_secret = false;
    if (hedgehog.find_latest_time_i_sent("alice") > -1)
      bob_must_reveal_secret = true;
    var amt_to_send =
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
      ]["amt_to_send"];
    {
      var to_alice = tapscript.Address.fromScriptPubKey([
        "OP_1",
        hedgehog.state["channel_0"].alices_pubkey,
      ]);
      var alt_revocable_scripts =
        hedgehog.bobs_revocation_script(bobs_revocation_hash);
      var alt_revocable = hedgehog.makeAddress(alt_revocable_scripts);
      var alt_target = tapscript.Tap.encodeScript(alt_revocable_scripts[1]);
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            txid,
            vout,
            amnt,
            hedgehog.state["channel_0"].multisig
          ),
        ],
        vout: [
          hedgehog.getVout(
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_alice
          ),
          hedgehog.getVout(330, alt_revocable),
        ],
      });
      var alt_txid = tapscript.Tx.util.getTxid(txdata);
      var txdata = tapscript.Tx.create({
        vin: [
          hedgehog.getVin(
            alt_txid,
            0,
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_alice
          ),
          hedgehog.getVin(alt_txid, 1, 330, alt_revocable),
        ],
        vout: [hedgehog.getVout(amnt - 330 - 500, to_alice)],
      });
      var penalty_target = tapscript.Tap.encodeScript(
        hedgehog.state["channel_0"].scripts[1][0]
      );
      var penalty_sig =
        hedgehog.state["channel_0"].alices_offchain_tx_info[
          hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
        ]["penalty_sig"];
      var sighash = tapscript.Signer.taproot.hash(txdata, 0, {
        extension: penalty_target,
      }).hex;
      var sig_is_valid = await nobleSecp256k1.schnorr.verify(
        penalty_sig,
        sighash,
        hedgehog.state["channel_0"].bobs_pubkey
      );
      if (!sig_is_valid) {
        alert(`nevermind, the penalty_sig was invalid`);
        return hedgehog.state["channel_0"].alices_offchain_tx_info.splice(
          hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1,
          1
        );
      }
      var penalty_sig_2 = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].alices_privkey,
        txdata,
        0,
        { extension: penalty_target }
      ).hex;
      var penalty_sig_3 = tapscript.Signer.taproot.sign(
        hedgehog.state["channel_0"].alices_privkey,
        txdata,
        1,
        { extension: alt_target }
      ).hex;
      var latest_time_i_sent = hedgehog.find_latest_time_i_sent("alice");
      if (bob_must_reveal_secret) {
        var txdata = tapscript.Tx.create({
          vin: [
            hedgehog.getVin(
              alt_txid,
              0,
              amnt - 330 - 500,
              hedgehog.state["channel_0"].multisig_or_alice
            ),
            hedgehog.getVin(alt_txid, 1, 330, alt_revocable),
          ],
          vout: [
            hedgehog.getVout(
              hedgehog.state["channel_0"].balances_according_to_alice[0] +
                amt_to_send,
              hedgehog.state["channel_0"].alices_address
            ),
            hedgehog.getVout(
              hedgehog.state["channel_0"].balances_according_to_alice[1] -
                amt_to_send -
                500 -
                500,
              hedgehog.state["channel_0"].bobs_address
            ),
          ],
        });
        var force_close_sig_1 =
          hedgehog.state["channel_0"].alices_offchain_tx_info[
            hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
          ]["force_close_sig_1"];
        var force_close_sig_2 =
          hedgehog.state["channel_0"].alices_offchain_tx_info[
            hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
          ]["force_close_sig_2"];
        var sighash = tapscript.Signer.taproot.hash(txdata, 0, {
          extension: penalty_target,
        }).hex;
        var sig_is_valid = await nobleSecp256k1.schnorr.verify(
          force_close_sig_1,
          sighash,
          hedgehog.state["channel_0"].bobs_pubkey
        );
        if (!sig_is_valid) {
          alert(`nevermind, force_close_sig_1 was invalid`);
          return hedgehog.state["channel_0"].alices_offchain_tx_info.splice(
            hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1,
            1
          );
        }
        var penalty_target_2 = tapscript.Tap.encodeScript(
          hedgehog.state["channel_0"].scripts[
            hedgehog.state["channel_0"].scripts.length - 1
          ][2]
        );
        var sighash = tapscript.Signer.taproot.hash(txdata, 1, {
          extension: penalty_target_2,
        }).hex;
        var sig_is_valid = await nobleSecp256k1.schnorr.verify(
          force_close_sig_2,
          sighash,
          hedgehog.state["channel_0"].bobs_pubkey
        );
        if (!sig_is_valid) {
          alert(`nevermind, force_close_sig_2 was invalid`);
          return hedgehog.state["channel_0"].alices_offchain_tx_info.splice(
            hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1,
            1
          );
        }
        var force_close_sig_3 = tapscript.Signer.taproot.sign(
          hedgehog.state["channel_0"].alices_privkey,
          txdata,
          0,
          { extension: penalty_target }
        ).hex;
        var force_close_sig_4 = tapscript.Signer.taproot.sign(
          hedgehog.state["channel_0"].alices_privkey,
          txdata,
          1,
          { extension: penalty_target_2 }
        ).hex;
      }
      if (latest_time_i_sent > -1) {
        hedgehog.state["channel_0"].alices_offchain_tx_info[latest_time_i_sent][
          "penalty_sig"
        ] = penalty_sig;
        hedgehog.state["channel_0"].alices_offchain_tx_info[latest_time_i_sent][
          "penalty_sig_2"
        ] = penalty_sig_2;
        hedgehog.state["channel_0"].alices_offchain_tx_info[latest_time_i_sent][
          "penalty_sig_3"
        ] = penalty_sig_3;
        if (bob_must_reveal_secret)
          hedgehog.state["channel_0"].alices_offchain_tx_info[
            latest_time_i_sent
          ]["force_close_sig_1"] = force_close_sig_1;
        if (bob_must_reveal_secret)
          hedgehog.state["channel_0"].alices_offchain_tx_info[
            latest_time_i_sent
          ]["force_close_sig_2"] = force_close_sig_2;
        if (bob_must_reveal_secret)
          hedgehog.state["channel_0"].alices_offchain_tx_info[
            latest_time_i_sent
          ]["force_close_sig_3"] = force_close_sig_3;
        if (bob_must_reveal_secret)
          hedgehog.state["channel_0"].alices_offchain_tx_info[
            latest_time_i_sent
          ]["force_close_sig_4"] = force_close_sig_4;
      }
    }
    if (
      (bob_must_reveal_secret &&
        hedgehog.state["channel_0"].bob_should_reveal &&
        !bobs_info["secret"]) ||
      (bob_must_reveal_secret &&
        bobs_info["secret"] &&
        hedgehog.rmd160(hedgehog.hexToBytes(bobs_info["secret"])) !=
          bobs_previous_revocation_hash)
    ) {
      alert(`nevermind, Bob didn't reveal his secret`);
      return hedgehog.state["channel_0"].alices_offchain_tx_info.splice(
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1,
        1
      );
    }
    if (bob_must_reveal_secret) {
      var past_scripts =
        hedgehog.state["channel_0"].alices_offchain_tx_info[
          hedgehog.find_latest_time_i_sent("alice")
        ]["scripts"];
      var past_revocable = hedgehog.makeAddress(past_scripts);
      var past_tx = {
        vin: [
          hedgehog.getVin(
            txid,
            vout,
            amnt,
            hedgehog.state["channel_0"].multisig
          ),
        ],
        vout: [
          hedgehog.getVout(
            amnt - 330 - 500,
            hedgehog.state["channel_0"].multisig_or_alice
          ),
          hedgehog.getVout(330, past_revocable),
        ],
      };
      var past_txdata = tapscript.Tx.create(past_tx);
      var past_txid = tapscript.Tx.util.getTxid(past_txdata);
      var prev_txid =
        hedgehog.state["channel_0"].txids_alice_watches_for["order"][
          hedgehog.state["channel_0"].txids_alice_watches_for["order"].length -
            1
        ];
      if (
        "secret" in bobs_info &&
        hedgehog.state["channel_0"].bob_should_reveal
      )
        hedgehog.state["channel_0"].txids_alice_watches_for[prev_txid][
          "secret"
        ] = bobs_info["secret"];
      if (
        !hedgehog.state["channel_0"].bob_should_reveal &&
        bob_must_reveal_secret
      )
        hedgehog.state["channel_0"].bob_should_reveal = true;
      hedgehog.state["channel_0"].txids_alice_watches_for["order"].push(
        past_txid
      );
      hedgehog.state["channel_0"].txids_alice_watches_for[past_txid] = {
        secret: "",
        past_tx,
        index_of_tx_info_containing_recovery_scripts:
          hedgehog.find_latest_time_i_sent("alice"),
      };
      hedgehog.state["channel_0"].bobs_revocation_hashes.push(
        bobs_info["bobs_revocation_hash"]
      );
    }
    var prep_tx = {
      vin: [
        hedgehog.getVin(
          offchain_txid,
          0,
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_bob
        ),
        //TODO: change the 5 to a 2016
        hedgehog.getVin(offchain_txid, 1, 330, revocable, 5),
      ],
      vout: [
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_alice[0] +
            amt_to_send,
          hedgehog.state["channel_0"].alices_address
        ),
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_alice[1] -
            amt_to_send -
            500 -
            500,
          hedgehog.state["channel_0"].bobs_address
        ),
      ],
    };
    if (zero_out_alices_balance) prep_tx["vout"].splice(0, 1);
    if (zero_out_bobs_balance) prep_tx["vout"].splice(1, 1);
    var txdata = tapscript.Tx.create(prep_tx);
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[2][0]
    );
    var tree = hedgehog.state["channel_0"].trees[2];
    var [tpubkey, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree,
      target,
    });
    var sig_3 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
      ]["sig_3"];
    var sighash = tapscript.Signer.taproot.hash(txdata, 0, {
      extension: target,
    }).hex;
    var sig_is_valid = await nobleSecp256k1.schnorr.verify(
      sig_3,
      sighash,
      hedgehog.state["channel_0"].bobs_pubkey
    );
    if (!sig_is_valid) {
      alert(`nevermind, sig_3 was invalid`);
      return hedgehog.state["channel_0"].alices_offchain_tx_info.splice(
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1,
        1
      );
    }
    var sig_4 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].alices_privkey,
      txdata,
      0,
      { extension: target }
    ).hex;
    txdata.vin[0].witness = [
      sig_3,
      sig_4,
      hedgehog.state["channel_0"].scripts[0][0],
      cblock,
    ];
    //TODO: fix this part -- the script will be #1 the first time
    //you send but after that I think it depends on who is sending
    var target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
      ]["scripts"][0]
    );
    var tree =
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
      ]["trees"][0];
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree,
      target,
    });
    var sig_5 = tapscript.Signer.taproot.sign(
      hedgehog.state["channel_0"].alices_privkey,
      txdata,
      1,
      { extension: target }
    ).hex;
    //the script is supposed to come from the ones I made when I ran makeAddress to make the revocable address.
    //So I used to say here to get the script from hedgehog.state[ "channel_0" ].scripts[ hedgehog.state[ "channel_0" ].scripts.length - 1 ][ 0 ]. But now
    //I call makeAddress 1 or 2 times after that, depending on whether Bob reveals his secret or not.
    //So I define an offset of 2 and if Bob revealed his secret then I increment it by 1, then get the
    //script from there
    var offset = 2;
    if (bob_must_reveal_secret) offset = offset + 1;
    txdata.vin[1].witness = [
      sig_5,
      hedgehog.state["channel_0"].scripts[
        hedgehog.state["channel_0"].scripts.length - offset
      ][0],
      cblock,
    ];
    hedgehog.state["channel_0"].balances_according_to_alice = [
      hedgehog.state["channel_0"].balances_according_to_alice[0] + amt_to_send,
      hedgehog.state["channel_0"].balances_according_to_alice[1] - amt_to_send,
    ];
    hedgehog.state["channel_0"].alices_offchain_tx_info[
      hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
    ]["tx1"] = txhex;
    var txhex = tapscript.Tx.encode(txdata).hex;
    hedgehog.state["channel_0"].alices_offchain_tx_info[
      hedgehog.state["channel_0"].alices_offchain_tx_info.length - 1
    ]["tx2"] = txhex;
    if (!initialization)
      alert(
        `Enter the command 'hedgehog.alice_close()' in your browser console to close the channel with this state:\n\nAlice: ${hedgehog.state["channel_0"].balances_according_to_alice[0]} sats\nBob: ${hedgehog.state["channel_0"].balances_according_to_alice[1]} sats`
      );
  },
  alice_close: () => {
    console.log(`broadcast this:`);
    console.log(
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.find_latest_time_i_received("alice")
      ]["tx1"]
    );
    //TODO: change the 5 to a 2016
    console.log(`broadcast this after 5 blocks:`);
    console.log(
      hedgehog.state["channel_0"].alices_offchain_tx_info[
        hedgehog.find_latest_time_i_received("alice")
      ]["tx2"]
    );
  },
  alice_penalize: (txid) => {
    var secret =
      hedgehog.state["channel_0"].txids_alice_watches_for[txid]["secret"];
    var index =
      hedgehog.state["channel_0"].txids_alice_watches_for[txid][
        "index_of_tx_info_containing_recovery_scripts"
      ];
    var script =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index]["scripts"][1];
    var tree =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index]["trees"][0];
    var target = tapscript.Tap.encodeScript(script);
    var past_tx =
      hedgehog.state["channel_0"].txids_alice_watches_for[txid]["past_tx"];
    var revocable = tapscript.Address.fromScriptPubKey(
      past_tx["vout"][1]["scriptPubKey"]
    );
    var to_alice = tapscript.Address.fromScriptPubKey([
      "OP_1",
      hedgehog.state["channel_0"].alices_pubkey,
    ]);
    var amnt =
      hedgehog.state["channel_0"].txids_alice_watches_for[txid]["past_tx"][
        "vin"
      ][0]["prevout"]["value"];
    var txdata = tapscript.Tx.create({
      vin: [
        hedgehog.getVin(
          txid,
          0,
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_alice
        ),
        hedgehog.getVin(txid, 1, 330, revocable),
      ],
      vout: [hedgehog.getVout(amnt - 330 - 500, to_alice)],
    });
    var sig_1 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index]["penalty_sig"];
    var sig_2 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index][
        "penalty_sig_2"
      ];
    var sig_3 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index][
        "penalty_sig_3"
      ];
    var penalty_target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[1][0]
    );
    // var sighash = tapscript.Signer.taproot.hash( txdata, 0, { extension: penalty_target }).hex;
    // var sig_is_valid = await nobleSecp256k1.schnorr.verify( sig_1, sighash, hedgehog.state[ "channel_0" ].bobs_pubkey );
    // console.log( sig_is_valid );
    var penalty_tree = hedgehog.state["channel_0"].trees[1];
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree: penalty_tree,
      target: penalty_target,
    });
    var penalty_cblock = cblock;
    txdata.vin[0].witness = [
      sig_1,
      sig_2,
      hedgehog.state["channel_0"].scripts[1][0],
      penalty_cblock,
    ];
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree,
      target,
    });
    txdata.vin[1].witness = [sig_3, secret, script, cblock];
    var txhex = tapscript.Tx.encode(txdata).hex;
    console.log(`broadcast this to penalize Bob:`);
    if (
      hedgehog.state["channel_0"].txids_alice_watches_for.order.indexOf(txid) !=
      hedgehog.state["channel_0"].txids_alice_watches_for.order.length - 1
    ) {
      return console.log(txhex);
    }
    var txdata = tapscript.Tx.create({
      vin: [
        hedgehog.getVin(
          txid,
          0,
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_alice
        ),
        hedgehog.getVin(txid, 1, 330, revocable),
      ],
      vout: [
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_alice[0],
          hedgehog.state["channel_0"].alices_address
        ),
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_alice[1] -
            500 -
            500,
          hedgehog.state["channel_0"].bobs_address
        ),
      ],
    });
    //sig_1 is for input 0
    var sig_1 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index][
        "force_close_sig_1"
      ];
    //sig_2 is for input 1
    var sig_2 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index][
        "force_close_sig_2"
      ];
    //sig_3 is for input 0
    var sig_3 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index][
        "force_close_sig_3"
      ];
    //sig_4 is for input 1
    var sig_4 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index][
        "force_close_sig_4"
      ];
    var script_for_input_0 = hedgehog.state["channel_0"].scripts[1][0];
    var target_for_input_0 = tapscript.Tap.encodeScript(script_for_input_0);
    var tree_for_input_0 = hedgehog.state["channel_0"].trees[1];
    var script_for_input_1 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index]["scripts"][2];
    var target_for_input_1 = tapscript.Tap.encodeScript(script_for_input_1);
    var tree_for_input_1 =
      hedgehog.state["channel_0"].alices_offchain_tx_info[index]["trees"][0];
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree: tree_for_input_0,
      target: target_for_input_0,
    });
    var cblock_for_input_0 = cblock;
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree: tree_for_input_1,
      target: target_for_input_1,
    });
    var cblock_for_input_1 = cblock;
    txdata.vin[0].witness = [
      sig_1,
      sig_3,
      script_for_input_0,
      cblock_for_input_0,
    ];
    txdata.vin[1].witness = [
      sig_2,
      sig_4,
      script_for_input_1,
      cblock_for_input_1,
    ];
    var txhex = tapscript.Tx.encode(txdata).hex;
    console.log(txhex);
  },
  bob_penalize: (txid) => {
    var secret =
      hedgehog.state["channel_0"].txids_bob_watches_for[txid]["secret"];
    var index =
      hedgehog.state["channel_0"].txids_bob_watches_for[txid][
        "index_of_tx_info_containing_recovery_scripts"
      ];
    var script =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index]["scripts"][1];
    var tree =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index]["trees"][0];
    var target = tapscript.Tap.encodeScript(script);
    var past_tx =
      hedgehog.state["channel_0"].txids_bob_watches_for[txid]["past_tx"];
    var revocable = tapscript.Address.fromScriptPubKey(
      past_tx["vout"][1]["scriptPubKey"]
    );
    var to_bob = tapscript.Address.fromScriptPubKey([
      "OP_1",
      hedgehog.state["channel_0"].bobs_pubkey,
    ]);
    var amnt =
      hedgehog.state["channel_0"].txids_bob_watches_for[txid]["past_tx"][
        "vin"
      ][0]["prevout"]["value"];
    var txdata = tapscript.Tx.create({
      vin: [
        hedgehog.getVin(
          txid,
          0,
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_bob
        ),
        hedgehog.getVin(txid, 1, 330, revocable),
      ],
      vout: [hedgehog.getVout(amnt - 330 - 500, to_bob)],
    });
    var sig_1 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index]["penalty_sig"];
    var sig_2 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index]["penalty_sig_2"];
    var sig_3 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index]["penalty_sig_3"];
    var penalty_target = tapscript.Tap.encodeScript(
      hedgehog.state["channel_0"].scripts[2][0]
    );
    var penalty_tree = hedgehog.state["channel_0"].trees[2];
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree: penalty_tree,
      target: penalty_target,
    });
    var penalty_cblock = cblock;
    txdata.vin[0].witness = [
      sig_2,
      sig_1,
      hedgehog.state["channel_0"].scripts[2][0],
      penalty_cblock,
    ];
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree,
      target,
    });
    txdata.vin[1].witness = [sig_3, secret, script, cblock];
    var txhex = tapscript.Tx.encode(txdata).hex;
    console.log(`broadcast this to penalize Alice:`);
    if (
      hedgehog.state["channel_0"].txids_bob_watches_for.order.indexOf(txid) !=
      hedgehog.state["channel_0"].txids_bob_watches_for.order.length - 1
    ) {
      return console.log(txhex);
    }
    var txdata = tapscript.Tx.create({
      vin: [
        hedgehog.getVin(
          txid,
          0,
          amnt - 330 - 500,
          hedgehog.state["channel_0"].multisig_or_bob
        ),
        hedgehog.getVin(txid, 1, 330, revocable),
      ],
      vout: [
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_bob[0] - 500 - 500,
          hedgehog.state["channel_0"].alices_address
        ),
        hedgehog.getVout(
          hedgehog.state["channel_0"].balances_according_to_bob[1],
          hedgehog.state["channel_0"].bobs_address
        ),
      ],
    });
    //sig_1 is for input 0
    var sig_1 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index][
        "force_close_sig_1"
      ];
    //sig_2 is for input 1
    var sig_2 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index][
        "force_close_sig_2"
      ];
    //sig_3 is for input 0
    var sig_3 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index][
        "force_close_sig_3"
      ];
    //sig_4 is for input 1
    var sig_4 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index][
        "force_close_sig_4"
      ];
    var script_for_input_0 = hedgehog.state["channel_0"].scripts[2][0];
    var target_for_input_0 = tapscript.Tap.encodeScript(script_for_input_0);
    var tree_for_input_0 = hedgehog.state["channel_0"].trees[2];
    var script_for_input_1 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index]["scripts"][2];
    var target_for_input_1 = tapscript.Tap.encodeScript(script_for_input_1);
    var tree_for_input_1 =
      hedgehog.state["channel_0"].bobs_offchain_tx_info[index]["trees"][0];
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree: tree_for_input_0,
      target: target_for_input_0,
    });
    var cblock_for_input_0 = cblock;
    var [_, cblock] = tapscript.Tap.getPubKey("ab".repeat(32), {
      tree: tree_for_input_1,
      target: target_for_input_1,
    });
    var cblock_for_input_1 = cblock;
    txdata.vin[0].witness = [
      sig_3,
      sig_1,
      script_for_input_0,
      cblock_for_input_0,
    ];
    txdata.vin[1].witness = [
      sig_4,
      sig_2,
      script_for_input_1,
      cblock_for_input_1,
    ];
    var txhex = tapscript.Tx.encode(txdata).hex;
    console.log(txhex);
  },
  // makeTx: ( txid, vout, amnt, addy, to_addy ) => {
  //     var tx = {
  //         vin: [hedgehog.getVin( txid, vout, amnt, addy )],
  //         //todo: estimate the actual fee cost and include anchors
  //         vout: [hedgehog.getVout( amnt - 500, to_addy )],
  //     }
  //     var txdata = tapscript.Tx.create( tx );
  //     return tapscript.Tx.encode( txdata ).hex;
  // },
  // find_latest_revocation_hash: user => {
  //     if ( user == "bob" ) var temp = [...hedgehog.state[ "channel_0" ].bobs_offchain_tx_info].reverse();
  //     else var temp = [...hedgehog.state[ "channel_0" ].alices_offchain_tx_info].reverse();
  //     var hash;
  //     temp.every( item => {
  //         if ( user == "bob" && "alices_revocation_hash" in item ) {return hash = item[ "alices_revocation_hash" ];}
  //         if ( user == "alice" && "bobs_revocation_hash" in item ) {return hash = item[ "bobs_revocation_hash" ];}
  //         return true;
  //     });
  //     return hash;
  // },
  // find_index_of_offchain_tx_info_with_this_txid: ( user, txid ) => {
  //     if ( user == "bob" ) var temp = [...hedgehog.state[ "channel_0" ].bobs_offchain_tx_info].reverse();
  //     else var temp = [...hedgehog.state[ "channel_0" ].alices_offchain_tx_info].reverse();
  //     var index_i_seek = -1;
  //     temp.every( ( item, index ) => {
  //         if ( "penalty_txid" in item && item[ "penalty_txid" ] == txid ) {
  //             return index_i_seek = index;
  //         }
  //         return true;
  //     });
  //     if ( index_i_seek < 0 ) return -1;
  //     return temp.length - 1 - index_i_seek;
  // },
};

var $ = document.querySelector.bind(document);
var $$ = document.querySelectorAll.bind(document);
var url_params = new URLSearchParams(window.location.search);
var url_keys = url_params.keys();
var $_GET = {};
for (var key of url_keys) $_GET[key] = url_params.get(key);

var init = async () => {
  if (!$_GET["bob"]) {
    hedgehog.state["channel_0"].alices_privkey = "ab".repeat(32);
    hedgehog.state["channel_0"].alices_pubkey = nobleSecp256k1
      .getPublicKey(hedgehog.state["channel_0"].alices_privkey, true)
      .substring(2);
    var alices_initial_secret = hedgehog
      .bytesToHex(nobleSecp256k1.utils.randomPrivateKey())
      .substring(0, 32);
    var alices_initial_revocation_hash = hedgehog.rmd160(
      hedgehog.hexToBytes(alices_initial_secret)
    );
    hedgehog.state["channel_0"].alices_revocation_preimages.push(
      alices_initial_secret
    );
    hedgehog.state["channel_0"].alices_revocation_hashes.push(
      alices_initial_revocation_hash
    );
    console.log(`Alice's pubkey and revocation hash:`);
    console.log(
      JSON.stringify([
        hedgehog.state["channel_0"].alices_pubkey,
        alices_initial_revocation_hash,
      ])
    );
    var bobs_pubkey_and_hash = JSON.parse(
      prompt(`Enter Bob's pubkey and revocation hash`)
    );
    hedgehog.state["channel_0"].bobs_pubkey = bobs_pubkey_and_hash[0];
    var bobs_initial_revocation_hash = bobs_pubkey_and_hash[1];
    hedgehog.state["channel_0"].bobs_revocation_hashes.push(
      bobs_initial_revocation_hash
    );
  } else {
    hedgehog.state["channel_0"].bobs_privkey = "ba".repeat(32);
    hedgehog.state["channel_0"].bobs_pubkey = nobleSecp256k1
      .getPublicKey(hedgehog.state["channel_0"].bobs_privkey, true)
      .substring(2);
    var bobs_initial_secret = hedgehog
      .bytesToHex(nobleSecp256k1.utils.randomPrivateKey())
      .substring(0, 32);
    var bobs_initial_revocation_hash = hedgehog.rmd160(
      hedgehog.hexToBytes(bobs_initial_secret)
    );
    hedgehog.state["channel_0"].bobs_revocation_preimages.push(
      bobs_initial_secret
    );
    hedgehog.state["channel_0"].bobs_revocation_hashes.push(
      bobs_initial_revocation_hash
    );
    console.log(`Bob's pubkey and revocation hash:`);
    console.log(
      JSON.stringify([
        hedgehog.state["channel_0"].bobs_pubkey,
        bobs_initial_revocation_hash,
      ])
    );
    var alices_pubkey_and_hash = JSON.parse(
      prompt(`Enter Alice's pubkey and revocation hash`)
    );
    hedgehog.state["channel_0"].alices_pubkey = alices_pubkey_and_hash[0];
    var alices_initial_revocation_hash = alices_pubkey_and_hash[1];
    hedgehog.state["channel_0"].alices_revocation_hashes.push(
      alices_initial_revocation_hash
    );
  }
  hedgehog.state["channel_0"].alices_address =
    tapscript.Address.fromScriptPubKey(
      ["OP_1", hedgehog.state["channel_0"].alices_pubkey],
      hedgehog.network
    );
  hedgehog.state["channel_0"].bobs_address = tapscript.Address.fromScriptPubKey(
    ["OP_1", hedgehog.state["channel_0"].bobs_pubkey],
    hedgehog.network
  );
  var multisig_scripts = [
    [
      hedgehog.state["channel_0"].alices_pubkey,
      "OP_CHECKSIG",
      hedgehog.state["channel_0"].bobs_pubkey,
      "OP_CHECKSIGADD",
      2,
      "OP_EQUAL",
    ],
  ];
  hedgehog.state["channel_0"].multisig = hedgehog.makeAddress(multisig_scripts);
  var multisig_or_alice_scripts = [
    [
      hedgehog.state["channel_0"].alices_pubkey,
      "OP_CHECKSIG",
      hedgehog.state["channel_0"].bobs_pubkey,
      "OP_CHECKSIGADD",
      2,
      "OP_EQUAL",
    ],
    //TODO: change the 10 to 4032
    [
      10,
      "OP_CHECKSEQUENCEVERIFY",
      "OP_DROP",
      hedgehog.state["channel_0"].alices_pubkey,
      "OP_CHECKSIG",
    ],
  ];
  hedgehog.state["channel_0"].multisig_or_alice = hedgehog.makeAddress(
    multisig_or_alice_scripts
  );
  var multisig_or_bob_scripts = [
    [
      hedgehog.state["channel_0"].alices_pubkey,
      "OP_CHECKSIG",
      hedgehog.state["channel_0"].bobs_pubkey,
      "OP_CHECKSIGADD",
      2,
      "OP_EQUAL",
    ],
    //TODO: change the 10 to 4032
    [
      10,
      "OP_CHECKSEQUENCEVERIFY",
      "OP_DROP",
      hedgehog.state["channel_0"].bobs_pubkey,
      "OP_CHECKSIG",
    ],
  ];
  hedgehog.state["channel_0"].multisig_or_bob = hedgehog.makeAddress(
    multisig_or_bob_scripts
  );
  var txid = prompt(
    `send some sats to this address and give the txid:\n\n${hedgehog.state["channel_0"].multisig}`
  );
  var vout = Number(prompt(`and the vout`));
  var amnt = Number(prompt(`and the amount`));
  hedgehog.state["channel_0"].multisig_utxo_info = {
    txid,
    vout,
    amnt,
  };
  hedgehog.state["channel_0"].balances_according_to_alice = [0, amnt];
  hedgehog.state["channel_0"].balances_according_to_bob = [0, amnt];
  var initialization = true;
  if ($_GET["bob"]) hedgehog.bob_send(amnt - 1_000, initialization);
  else await hedgehog.alice_receive(initialization);
  hedgehog.state["channel_0"].balances_according_to_alice = [amnt, 0];
  hedgehog.state["channel_0"].balances_according_to_bob = [amnt, 0];
  alert(
    `Yay, your channel is funded! Enter the command 'hedgehog.alice_send()' or 'hedgehog.bob_send()' in your browser console to have one party send the other an off-chain payment`
  );
};
window.onload = () => {
  setTimeout(() => {
    init();
  });
};
