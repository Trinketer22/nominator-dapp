// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a NominatorPool contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

type StoreCallback<T> = (obj: T, b: c.Builder) => void
type LoadCallback<T> = (s: c.Slice) => T

export type CellRef<T> = {
    ref: T
}

function makeCellFrom<T>(self: T, storeFn_T: StoreCallback<T>): c.Cell {
    let b = beginCell();
    storeFn_T(self, b);
    return b.endCell();
}

function loadAndCheckPrefix32(s: c.Slice, expected: number, structName: string): void {
    let prefix = s.loadUint(32);
    if (prefix !== expected) {
        throw new Error(`Incorrect prefix for '${structName}': expected 0x${expected.toString(16).padStart(8, '0')}, got 0x${prefix.toString(16).padStart(8, '0')}`);
    }
}

function formatPrefix(prefixNum: number, prefixLen: number): string {
    return prefixLen % 4 ? `0b${prefixNum.toString(2).padStart(prefixLen, '0')}` : `0x${prefixNum.toString(16).padStart(prefixLen / 4, '0')}`;
}

function loadAndCheckPrefix(s: c.Slice, expected: number, prefixLen: number, structName: string): void {
    let prefix = s.loadUint(prefixLen);
    if (prefix !== expected) {
        throw new Error(`Incorrect prefix for '${structName}': expected ${formatPrefix(expected, prefixLen)}, got ${formatPrefix(prefix, prefixLen)}`);
    }
}

function lookupPrefix(s: c.Slice, expected: number, prefixLen: number): boolean {
    return s.remainingBits >= prefixLen && s.preloadUint(prefixLen) === expected;
}

function lookupPrefixAndEat(s: c.Slice, expected: number, prefixLen: number): boolean {
    if (lookupPrefix(s, expected, prefixLen)) {
        s.skip(prefixLen);
        return true;
    }
    return false;
}

function throwNonePrefixMatch(fieldPath: string): never {
    throw new Error(`Incorrect prefix for '${fieldPath}': none of variants matched`);
}

function storeCellRef<T>(cell: CellRef<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let b_ref = c.beginCell();
    storeFn_T(cell.ref, b_ref);
    b.storeRef(b_ref.endCell());
}

function loadCellRef<T>(s: c.Slice, loadFn_T: LoadCallback<T>): CellRef<T> {
    let s_ref = s.loadRef().beginParse();
    return { ref: loadFn_T(s_ref) };
}

function storeTolkRemaining(v: RemainingBitsAndRefs, b: c.Builder): void {
    b.storeSlice(v);
}

function loadTolkRemaining(s: c.Slice): RemainingBitsAndRefs {
    let rest = s.clone();
    s.loadBits(s.remainingBits);
    while (s.remainingRefs) {
        s.loadRef();
    }
    return rest;
}

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
}

function createDictionaryValue<V>(loadFn_V: LoadCallback<V>, storeFn_V: StoreCallback<V>): c.DictionaryValue<V> {
    return {
        serialize(self: V, b: c.Builder) {
            storeFn_V(self, b);
        },
        parse(s: c.Slice): V {
            const value = loadFn_V(s);
            s.endParse();
            return value;
        }
    }
}

// ————————————————————————————————————————————
//   parse get methods result from a TVM stack
//

class StackReader {
    constructor(private tuple: c.TupleItem[]) {
    }

    static fromGetMethod(expectedN: number, getMethodResult: { stack: c.TupleReader }): StackReader {
        let tuple = [] as c.TupleItem[];
        while (getMethodResult.stack.remaining) {
            tuple.push(getMethodResult.stack.pop());
        }
        if (tuple.length !== expectedN) {
            throw new Error(`expected ${expectedN} stack width, got ${tuple.length}`);
        }
        return new StackReader(tuple);
    }

    private popExpecting<ItemT>(itemType: string): ItemT {
        const item = this.tuple.shift();
        if (item?.type === itemType) {
            return item as ItemT;
        }
        throw new Error(`not '${itemType}' on a stack`);
    }

    private popCellLike(): c.Cell {
        const item = this.tuple.shift();
        if (item && (item.type === 'cell' || item.type === 'slice' || item.type === 'builder')) {
            return item.cell;
        }
        throw new Error(`not cell/slice on a stack`);
    }

    readBigInt(): bigint {
        return this.popExpecting<c.TupleItemInt>('int').value;
    }

    readBoolean(): boolean {
        return this.popExpecting<c.TupleItemInt>('int').value !== 0n;
    }

    readCell(): c.Cell {
        return this.popCellLike();
    }

    readSlice(): c.Slice {
        return this.popCellLike().beginParse();
    }

    readNullLiteral(): null {
        this.popExpecting<c.TupleItemNull>('null');
        return null;
    }

    readNullable<T>(readFn_T: (r: StackReader) => T): T | null {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return null;
        }
        return readFn_T(this);
    }

    readWideNullable<T>(stackW: number, readFn_T: (r: StackReader) => T): T | null {
        const slotTypeId = this.tuple[stackW - 1];
        if (slotTypeId?.type !== 'int') {
            throw new Error(`not 'int' on a stack`);
        }
        if (slotTypeId.value === 0n) {
            this.tuple = this.tuple.slice(stackW);
            return null;
        }
        const valueT = readFn_T(this);
        this.tuple.shift();
        return valueT;
    }

    readUnionType<T>(stackW: number, infoForTypeId: Record<number, [number, string | null, (r: StackReader) => any]>): T {
        const slotTypeId = this.tuple[stackW - 1];
        if (slotTypeId?.type !== 'int') {
            throw new Error(`not 'int' on a stack`);
        }
        const info = infoForTypeId[Number(slotTypeId.value)];   // [stackWidth, label, readFn_T{i}]
        if (info == null) {
            throw new Error(`unexpected UTag=${slotTypeId.value}`);
        }
        const label = info[1];
        this.tuple = this.tuple.slice(stackW - 1 - info[0]);
        const valueT = info[2](this);
        this.tuple.shift();
        return label == null ? valueT : { $: label, value: valueT } as T;
    }

    readCellRef<T>(loadFn_T: LoadCallback<T>): CellRef<T> {
        return { ref: loadFn_T(this.readCell().beginParse()) };
    }
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint2 = bigint
type uint5 = bigint
type uint6 = bigint
type uint7 = bigint
type uint8 = bigint
type uint10 = bigint
type uint16 = bigint
type uint25 = bigint
type uint32 = bigint
type uint33 = bigint
type uint64 = bigint
type uint128 = bigint
type uint256 = bigint

/**
 > struct StateInit {
 >     fixedPrefixLength: uint5?
 >     special: (bool, bool)?
 >     code: cell?
 >     data: cell?
 >     library: cell?
 > }
 */
export interface StateInit {
    readonly $: 'StateInit'
    fixedPrefixLength: uint5 | null
    special: [boolean, boolean] | null
    code: c.Cell | null
    data: c.Cell | null
    library: c.Cell | null
}

export const StateInit = {
    create(args: {
        fixedPrefixLength: uint5 | null
        special: [boolean, boolean] | null
        code: c.Cell | null
        data: c.Cell | null
        library: c.Cell | null
    }): StateInit {
        return {
            $: 'StateInit',
            ...args
        }
    },
    fromSlice(s: c.Slice): StateInit {
        return {
            $: 'StateInit',
            fixedPrefixLength: s.loadBoolean() ? s.loadUintBig(5) : null,
            special: s.loadBoolean() ? [s.loadBoolean(), s.loadBoolean()] : null,
            code: s.loadBoolean() ? s.loadRef() : null,
            data: s.loadBoolean() ? s.loadRef() : null,
            library: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: StateInit, b: c.Builder): void {
        storeTolkNullable<uint5>(self.fixedPrefixLength, b,
            (v,b) => b.storeUint(v, 5)
        );
        storeTolkNullable<[boolean, boolean]>(self.special, b,
            (v,b) => { b.storeBit(v[0]);
            b.storeBit(v[1]); }
        );
        storeTolkNullable<c.Cell>(self.code, b,
            (v,b) => b.storeRef(v)
        );
        storeTolkNullable<c.Cell>(self.data, b,
            (v,b) => b.storeRef(v)
        );
        storeTolkNullable<c.Cell>(self.library, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: StateInit): c.Cell {
        return makeCellFrom<StateInit>(self, StateInit.store);
    }
}

/**
 > struct (0xcbfcc337) InitPoolMessage {
 >     queryId: uint64
 >     mainValidator: address
 >     roundAllowance: RoundAllowance
 >     limit: ValidatorLimitTon | ValidatorLimitShare | null
 >     ownerShare: uint25
 >     maxTonPerValidator: coins
 >     minTonPerValidator: coins
 >     refundBonus: uint33
 >     nominatorsSettings: Cell<NominatorsSettings>
 > }
 */
export interface InitPoolMessage {
    readonly $: 'InitPoolMessage'
    queryId: uint64
    mainValidator: c.Address
    roundAllowance: RoundAllowance /* = 3 as RoundAllowance */
    limit: ValidatorLimitTon | ValidatorLimitShare | null
    ownerShare: uint25
    maxTonPerValidator: coins
    minTonPerValidator: coins
    refundBonus: uint33
    nominatorsSettings: CellRef<NominatorsSettings>
}

export const InitPoolMessage = {
    PREFIX: 0xcbfcc337,

    create(args: {
        queryId: uint64
        mainValidator: c.Address
        roundAllowance?: RoundAllowance /* = 3 as RoundAllowance */
        limit: ValidatorLimitTon | ValidatorLimitShare | null
        ownerShare: uint25
        maxTonPerValidator: coins
        minTonPerValidator: coins
        refundBonus: uint33
        nominatorsSettings: CellRef<NominatorsSettings>
    }): InitPoolMessage {
        return {
            $: 'InitPoolMessage',
            roundAllowance: 3n,
            ...args
        }
    },
    fromSlice(s: c.Slice): InitPoolMessage {
        loadAndCheckPrefix32(s, 0xcbfcc337, 'InitPoolMessage');
        return {
            $: 'InitPoolMessage',
            queryId: s.loadUintBig(64),
            mainValidator: s.loadAddress(),
            roundAllowance: RoundAllowance.fromSlice(s),
            limit: lookupPrefixAndEat(s, 0b10, 2) ? ValidatorLimitTon.fromSlice(s) :
                lookupPrefixAndEat(s, 0b11, 2) ? ValidatorLimitShare.fromSlice(s) :
                lookupPrefixAndEat(s, 0b0, 1) ? null :
                throwNonePrefixMatch('InitPoolMessage.limit'),
            ownerShare: s.loadUintBig(25),
            maxTonPerValidator: s.loadCoins(),
            minTonPerValidator: s.loadCoins(),
            refundBonus: s.loadUintBig(33),
            nominatorsSettings: loadCellRef<NominatorsSettings>(s, NominatorsSettings.fromSlice),
        }
    },
    store(self: InitPoolMessage, b: c.Builder): void {
        b.storeUint(0xcbfcc337, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.mainValidator);
        RoundAllowance.store(self.roundAllowance, b);
        if (self.limit === null) {
            b.storeUint(0b0, 1);
        } else switch (self.limit.$) {
            case 'ValidatorLimitTon':
                b.storeUint(0b10, 2);
                ValidatorLimitTon.store(self.limit, b);
                break;
            case 'ValidatorLimitShare':
                b.storeUint(0b11, 2);
                ValidatorLimitShare.store(self.limit, b);
                break;
        }
        b.storeUint(self.ownerShare, 25);
        b.storeCoins(self.maxTonPerValidator);
        b.storeCoins(self.minTonPerValidator);
        b.storeUint(self.refundBonus, 33);
        storeCellRef<NominatorsSettings>(self.nominatorsSettings, b, NominatorsSettings.store);
    },
    toCell(self: InitPoolMessage): c.Cell {
        return makeCellFrom<InitPoolMessage>(self, InitPoolMessage.store);
    }
}

/**
 > struct (0xd9478669) InitPoolSuccess {
 >     queryId: uint64
 > }
 */
export interface InitPoolSuccess {
    readonly $: 'InitPoolSuccess'
    queryId: uint64
}

export const InitPoolSuccess = {
    PREFIX: 0xd9478669,

    create(args: {
        queryId: uint64
    }): InitPoolSuccess {
        return {
            $: 'InitPoolSuccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): InitPoolSuccess {
        loadAndCheckPrefix32(s, 0xd9478669, 'InitPoolSuccess');
        return {
            $: 'InitPoolSuccess',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: InitPoolSuccess, b: c.Builder): void {
        b.storeUint(0xd9478669, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: InitPoolSuccess): c.Cell {
        return makeCellFrom<InitPoolSuccess>(self, InitPoolSuccess.store);
    }
}

/**
 > struct (0x00000000) TextComment {
 >     comment: RemainingBitsAndRefs
 > }
 */
export interface TextComment {
    readonly $: 'TextComment'
    comment: RemainingBitsAndRefs
}

export const TextComment = {
    PREFIX: 0x00000000,

    create(args: {
        comment: RemainingBitsAndRefs
    }): TextComment {
        return {
            $: 'TextComment',
            ...args
        }
    },
    fromSlice(s: c.Slice): TextComment {
        loadAndCheckPrefix32(s, 0x00000000, 'TextComment');
        return {
            $: 'TextComment',
            comment: loadTolkRemaining(s),
        }
    },
    store(self: TextComment, b: c.Builder): void {
        b.storeUint(0x00000000, 32);
        storeTolkRemaining(self.comment, b);
    },
    toCell(self: TextComment): c.Cell {
        return makeCellFrom<TextComment>(self, TextComment.store);
    }
}

/**
 > struct (0x1d462054) DepositSuccess {
 >     queryId: uint64
 > }
 */
export interface DepositSuccess {
    readonly $: 'DepositSuccess'
    queryId: uint64
}

export const DepositSuccess = {
    PREFIX: 0x1d462054,

    create(args: {
        queryId: uint64
    }): DepositSuccess {
        return {
            $: 'DepositSuccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): DepositSuccess {
        loadAndCheckPrefix32(s, 0x1d462054, 'DepositSuccess');
        return {
            $: 'DepositSuccess',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: DepositSuccess, b: c.Builder): void {
        b.storeUint(0x1d462054, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: DepositSuccess): c.Cell {
        return makeCellFrom<DepositSuccess>(self, DepositSuccess.store);
    }
}

/**
 > struct (0xac9a3b31) WithdrawSuccess {
 >     queryId: uint64
 >     totalStaked: coins
 >     returned: coins
 >     left: coins
 > }
 */
export interface WithdrawSuccess {
    readonly $: 'WithdrawSuccess'
    queryId: uint64
    totalStaked: coins
    returned: coins
    left: coins
}

export const WithdrawSuccess = {
    PREFIX: 0xac9a3b31,

    create(args: {
        queryId: uint64
        totalStaked: coins
        returned: coins
        left: coins
    }): WithdrawSuccess {
        return {
            $: 'WithdrawSuccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): WithdrawSuccess {
        loadAndCheckPrefix32(s, 0xac9a3b31, 'WithdrawSuccess');
        return {
            $: 'WithdrawSuccess',
            queryId: s.loadUintBig(64),
            totalStaked: s.loadCoins(),
            returned: s.loadCoins(),
            left: s.loadCoins(),
        }
    },
    store(self: WithdrawSuccess, b: c.Builder): void {
        b.storeUint(0xac9a3b31, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.totalStaked);
        b.storeCoins(self.returned);
        b.storeCoins(self.left);
    },
    toCell(self: WithdrawSuccess): c.Cell {
        return makeCellFrom<WithdrawSuccess>(self, WithdrawSuccess.store);
    }
}

/**
 > struct (0x00000007) UpdateVset {
 >     queryId: uint64
 > }
 */
export interface UpdateVset {
    readonly $: 'UpdateVset'
    queryId: uint64
}

export const UpdateVset = {
    PREFIX: 0x00000007,

    create(args: {
        queryId: uint64
    }): UpdateVset {
        return {
            $: 'UpdateVset',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpdateVset {
        loadAndCheckPrefix32(s, 0x00000007, 'UpdateVset');
        return {
            $: 'UpdateVset',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: UpdateVset, b: c.Builder): void {
        b.storeUint(0x00000007, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: UpdateVset): c.Cell {
        return makeCellFrom<UpdateVset>(self, UpdateVset.store);
    }
}

/**
 > struct (0x4e73744b) NewStake {
 >     queryId: uint64
 >     value: coins
 >     signedBody: RemainingBitsAndRefs
 > }
 */
export interface NewStake {
    readonly $: 'NewStake'
    queryId: uint64
    value: coins
    signedBody: RemainingBitsAndRefs
}

export const NewStake = {
    PREFIX: 0x4e73744b,

    create(args: {
        queryId: uint64
        value: coins
        signedBody: RemainingBitsAndRefs
    }): NewStake {
        return {
            $: 'NewStake',
            ...args
        }
    },
    fromSlice(s: c.Slice): NewStake {
        loadAndCheckPrefix32(s, 0x4e73744b, 'NewStake');
        return {
            $: 'NewStake',
            queryId: s.loadUintBig(64),
            value: s.loadCoins(),
            signedBody: loadTolkRemaining(s),
        }
    },
    store(self: NewStake, b: c.Builder): void {
        b.storeUint(0x4e73744b, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.value);
        storeTolkRemaining(self.signedBody, b);
    },
    toCell(self: NewStake): c.Cell {
        return makeCellFrom<NewStake>(self, NewStake.store);
    }
}

/**
 > struct (0x4e73744b) NewStakeElector {
 >     queryId: uint64
 >     body: RemainingBitsAndRefs
 > }
 */
export interface NewStakeElector {
    readonly $: 'NewStakeElector'
    queryId: uint64
    body: RemainingBitsAndRefs
}

export const NewStakeElector = {
    PREFIX: 0x4e73744b,

    create(args: {
        queryId: uint64
        body: RemainingBitsAndRefs
    }): NewStakeElector {
        return {
            $: 'NewStakeElector',
            ...args
        }
    },
    fromSlice(s: c.Slice): NewStakeElector {
        loadAndCheckPrefix32(s, 0x4e73744b, 'NewStakeElector');
        return {
            $: 'NewStakeElector',
            queryId: s.loadUintBig(64),
            body: loadTolkRemaining(s),
        }
    },
    store(self: NewStakeElector, b: c.Builder): void {
        b.storeUint(0x4e73744b, 32);
        b.storeUint(self.queryId, 64);
        storeTolkRemaining(self.body, b);
    },
    toCell(self: NewStakeElector): c.Cell {
        return makeCellFrom<NewStakeElector>(self, NewStakeElector.store);
    }
}

/**
 > struct (0xf374484c) NewStakeOk {
 >     queryId: uint64
 >     answer: uint32
 >     remaining: RemainingBitsAndRefs
 > }
 */
export interface NewStakeOk {
    readonly $: 'NewStakeOk'
    queryId: uint64
    answer: uint32
    remaining: RemainingBitsAndRefs
}

export const NewStakeOk = {
    PREFIX: 0xf374484c,

    create(args: {
        queryId: uint64
        answer: uint32
        remaining: RemainingBitsAndRefs
    }): NewStakeOk {
        return {
            $: 'NewStakeOk',
            ...args
        }
    },
    fromSlice(s: c.Slice): NewStakeOk {
        loadAndCheckPrefix32(s, 0xf374484c, 'NewStakeOk');
        return {
            $: 'NewStakeOk',
            queryId: s.loadUintBig(64),
            answer: s.loadUintBig(32),
            remaining: loadTolkRemaining(s),
        }
    },
    store(self: NewStakeOk, b: c.Builder): void {
        b.storeUint(0xf374484c, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.answer, 32);
        storeTolkRemaining(self.remaining, b);
    },
    toCell(self: NewStakeOk): c.Cell {
        return makeCellFrom<NewStakeOk>(self, NewStakeOk.store);
    }
}

/**
 > struct (0xee6f454c) NewStakeError {
 >     queryId: uint64
 >     reason: uint32
 >     remaining: RemainingBitsAndRefs
 > }
 */
export interface NewStakeError {
    readonly $: 'NewStakeError'
    queryId: uint64
    reason: uint32
    remaining: RemainingBitsAndRefs
}

export const NewStakeError = {
    PREFIX: 0xee6f454c,

    create(args: {
        queryId: uint64
        reason: uint32
        remaining: RemainingBitsAndRefs
    }): NewStakeError {
        return {
            $: 'NewStakeError',
            ...args
        }
    },
    fromSlice(s: c.Slice): NewStakeError {
        loadAndCheckPrefix32(s, 0xee6f454c, 'NewStakeError');
        return {
            $: 'NewStakeError',
            queryId: s.loadUintBig(64),
            reason: s.loadUintBig(32),
            remaining: loadTolkRemaining(s),
        }
    },
    store(self: NewStakeError, b: c.Builder): void {
        b.storeUint(0xee6f454c, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.reason, 32);
        storeTolkRemaining(self.remaining, b);
    },
    toCell(self: NewStakeError): c.Cell {
        return makeCellFrom<NewStakeError>(self, NewStakeError.store);
    }
}

/**
 > struct (0x47657424) RecoverStakeCompat {
 >     queryId: uint64
 > }
 */
export interface RecoverStakeCompat {
    readonly $: 'RecoverStakeCompat'
    queryId: uint64
}

export const RecoverStakeCompat = {
    PREFIX: 0x47657424,

    create(args: {
        queryId: uint64
    }): RecoverStakeCompat {
        return {
            $: 'RecoverStakeCompat',
            ...args
        }
    },
    fromSlice(s: c.Slice): RecoverStakeCompat {
        loadAndCheckPrefix32(s, 0x47657424, 'RecoverStakeCompat');
        return {
            $: 'RecoverStakeCompat',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: RecoverStakeCompat, b: c.Builder): void {
        b.storeUint(0x47657424, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: RecoverStakeCompat): c.Cell {
        return makeCellFrom<RecoverStakeCompat>(self, RecoverStakeCompat.store);
    }
}

/**
 > struct (0x47657442) RecoverStakeUnrestricted {
 >     queryId: uint64
 >     validator: address
 >     amount: coins
 > }
 */
export interface RecoverStakeUnrestricted {
    readonly $: 'RecoverStakeUnrestricted'
    queryId: uint64
    validator: c.Address
    amount: coins
}

export const RecoverStakeUnrestricted = {
    PREFIX: 0x47657442,

    create(args: {
        queryId: uint64
        validator: c.Address
        amount: coins
    }): RecoverStakeUnrestricted {
        return {
            $: 'RecoverStakeUnrestricted',
            ...args
        }
    },
    fromSlice(s: c.Slice): RecoverStakeUnrestricted {
        loadAndCheckPrefix32(s, 0x47657442, 'RecoverStakeUnrestricted');
        return {
            $: 'RecoverStakeUnrestricted',
            queryId: s.loadUintBig(64),
            validator: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: RecoverStakeUnrestricted, b: c.Builder): void {
        b.storeUint(0x47657442, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.validator);
        b.storeCoins(self.amount);
    },
    toCell(self: RecoverStakeUnrestricted): c.Cell {
        return makeCellFrom<RecoverStakeUnrestricted>(self, RecoverStakeUnrestricted.store);
    }
}

/**
 > struct (0xf96f7324) RecoverStakeOk {
 >     queryId: uint64
 >     remaining: RemainingBitsAndRefs
 > }
 */
export interface RecoverStakeOk {
    readonly $: 'RecoverStakeOk'
    queryId: uint64
    remaining: RemainingBitsAndRefs
}

export const RecoverStakeOk = {
    PREFIX: 0xf96f7324,

    create(args: {
        queryId: uint64
        remaining: RemainingBitsAndRefs
    }): RecoverStakeOk {
        return {
            $: 'RecoverStakeOk',
            ...args
        }
    },
    fromSlice(s: c.Slice): RecoverStakeOk {
        loadAndCheckPrefix32(s, 0xf96f7324, 'RecoverStakeOk');
        return {
            $: 'RecoverStakeOk',
            queryId: s.loadUintBig(64),
            remaining: loadTolkRemaining(s),
        }
    },
    store(self: RecoverStakeOk, b: c.Builder): void {
        b.storeUint(0xf96f7324, 32);
        b.storeUint(self.queryId, 64);
        storeTolkRemaining(self.remaining, b);
    },
    toCell(self: RecoverStakeOk): c.Cell {
        return makeCellFrom<RecoverStakeOk>(self, RecoverStakeOk.store);
    }
}

/**
 > struct (0xfffffffe) RecoverStakeError {
 >     queryId: uint64
 >     answer: uint32
 >     remaining: RemainingBitsAndRefs
 > }
 */
export interface RecoverStakeError {
    readonly $: 'RecoverStakeError'
    queryId: uint64
    answer: uint32
    remaining: RemainingBitsAndRefs
}

export const RecoverStakeError = {
    PREFIX: 0xfffffffe,

    create(args: {
        queryId: uint64
        answer: uint32
        remaining: RemainingBitsAndRefs
    }): RecoverStakeError {
        return {
            $: 'RecoverStakeError',
            ...args
        }
    },
    fromSlice(s: c.Slice): RecoverStakeError {
        loadAndCheckPrefix32(s, 0xfffffffe, 'RecoverStakeError');
        return {
            $: 'RecoverStakeError',
            queryId: s.loadUintBig(64),
            answer: s.loadUintBig(32),
            remaining: loadTolkRemaining(s),
        }
    },
    store(self: RecoverStakeError, b: c.Builder): void {
        b.storeUint(0xfffffffe, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.answer, 32);
        storeTolkRemaining(self.remaining, b);
    },
    toCell(self: RecoverStakeError): c.Cell {
        return makeCellFrom<RecoverStakeError>(self, RecoverStakeError.store);
    }
}

/**
 > struct (0x7e522889) InitProxy {
 >     queryId: uint64
 >     response: address
 > }
 */
export interface InitProxy {
    readonly $: 'InitProxy'
    queryId: uint64
    response: c.Address
}

export const InitProxy = {
    PREFIX: 0x7e522889,

    create(args: {
        queryId: uint64
        response: c.Address
    }): InitProxy {
        return {
            $: 'InitProxy',
            ...args
        }
    },
    fromSlice(s: c.Slice): InitProxy {
        loadAndCheckPrefix32(s, 0x7e522889, 'InitProxy');
        return {
            $: 'InitProxy',
            queryId: s.loadUintBig(64),
            response: s.loadAddress(),
        }
    },
    store(self: InitProxy, b: c.Builder): void {
        b.storeUint(0x7e522889, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.response);
    },
    toCell(self: InitProxy): c.Cell {
        return makeCellFrom<InitProxy>(self, InitProxy.store);
    }
}

/**
 > struct (0xf8e41961) PayoutInitMessage {
 >     queryId: uint64
 >     isWithdrawal: bool
 >     owner: address
 >     roundIndex: uint64
 >     prev: address?
 >     next: address?
 > }
 */
export interface PayoutInitMessage {
    readonly $: 'PayoutInitMessage'
    queryId: uint64
    isWithdrawal: boolean
    owner: c.Address
    roundIndex: uint64
    prev: c.Address | null
    next: c.Address | null
}

export const PayoutInitMessage = {
    PREFIX: 0xf8e41961,

    create(args: {
        queryId: uint64
        isWithdrawal: boolean
        owner: c.Address
        roundIndex: uint64
        prev: c.Address | null
        next: c.Address | null
    }): PayoutInitMessage {
        return {
            $: 'PayoutInitMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): PayoutInitMessage {
        loadAndCheckPrefix32(s, 0xf8e41961, 'PayoutInitMessage');
        return {
            $: 'PayoutInitMessage',
            queryId: s.loadUintBig(64),
            isWithdrawal: s.loadBoolean(),
            owner: s.loadAddress(),
            roundIndex: s.loadUintBig(64),
            prev: s.loadMaybeAddress(),
            next: s.loadMaybeAddress(),
        }
    },
    store(self: PayoutInitMessage, b: c.Builder): void {
        b.storeUint(0xf8e41961, 32);
        b.storeUint(self.queryId, 64);
        b.storeBit(self.isWithdrawal);
        b.storeAddress(self.owner);
        b.storeUint(self.roundIndex, 64);
        b.storeAddress(self.prev);
        b.storeAddress(self.next);
    },
    toCell(self: PayoutInitMessage): c.Cell {
        return makeCellFrom<PayoutInitMessage>(self, PayoutInitMessage.store);
    }
}

/**
 > struct (0x53899a1b) PayoutBurnMessage {
 >     queryId: uint64
 >     distribution: Distribution
 > }
 */
export interface PayoutBurnMessage {
    readonly $: 'PayoutBurnMessage'
    queryId: uint64
    distribution: Distribution
}

export const PayoutBurnMessage = {
    PREFIX: 0x53899a1b,

    create(args: {
        queryId: uint64
        distribution: Distribution
    }): PayoutBurnMessage {
        return {
            $: 'PayoutBurnMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): PayoutBurnMessage {
        loadAndCheckPrefix32(s, 0x53899a1b, 'PayoutBurnMessage');
        return {
            $: 'PayoutBurnMessage',
            queryId: s.loadUintBig(64),
            distribution: Distribution.fromSlice(s),
        }
    },
    store(self: PayoutBurnMessage, b: c.Builder): void {
        b.storeUint(0x53899a1b, 32);
        b.storeUint(self.queryId, 64);
        Distribution.store(self.distribution, b);
    },
    toCell(self: PayoutBurnMessage): c.Cell {
        return makeCellFrom<PayoutBurnMessage>(self, PayoutBurnMessage.store);
    }
}

/**
 > struct (0x42a73984) PayoutBurnNotification {
 >     queryId: uint64
 >     isWithdrawal: bool
 >     owner: address
 >     index: uint64
 >     roundIndex: uint64
 >     distribution: Distribution
 > }
 */
export interface PayoutBurnNotification {
    readonly $: 'PayoutBurnNotification'
    queryId: uint64
    isWithdrawal: boolean
    owner: c.Address
    index: uint64
    roundIndex: uint64
    distribution: Distribution
}

export const PayoutBurnNotification = {
    PREFIX: 0x42a73984,

    create(args: {
        queryId: uint64
        isWithdrawal: boolean
        owner: c.Address
        index: uint64
        roundIndex: uint64
        distribution: Distribution
    }): PayoutBurnNotification {
        return {
            $: 'PayoutBurnNotification',
            ...args
        }
    },
    fromSlice(s: c.Slice): PayoutBurnNotification {
        loadAndCheckPrefix32(s, 0x42a73984, 'PayoutBurnNotification');
        return {
            $: 'PayoutBurnNotification',
            queryId: s.loadUintBig(64),
            isWithdrawal: s.loadBoolean(),
            owner: s.loadAddress(),
            index: s.loadUintBig(64),
            roundIndex: s.loadUintBig(64),
            distribution: Distribution.fromSlice(s),
        }
    },
    store(self: PayoutBurnNotification, b: c.Builder): void {
        b.storeUint(0x42a73984, 32);
        b.storeUint(self.queryId, 64);
        b.storeBit(self.isWithdrawal);
        b.storeAddress(self.owner);
        b.storeUint(self.index, 64);
        b.storeUint(self.roundIndex, 64);
        Distribution.store(self.distribution, b);
    },
    toCell(self: PayoutBurnNotification): c.Cell {
        return makeCellFrom<PayoutBurnNotification>(self, PayoutBurnNotification.store);
    }
}

/**
 > struct (0xd6d1ff31) StakeReturned {
 >     queryId: uint64
 >     validator: address
 >     used: coins
 >     returned: coins
 > }
 */
export interface StakeReturned {
    readonly $: 'StakeReturned'
    queryId: uint64
    validator: c.Address
    used: coins
    returned: coins
}

export const StakeReturned = {
    PREFIX: 0xd6d1ff31,

    create(args: {
        queryId: uint64
        validator: c.Address
        used: coins
        returned: coins
    }): StakeReturned {
        return {
            $: 'StakeReturned',
            ...args
        }
    },
    fromSlice(s: c.Slice): StakeReturned {
        loadAndCheckPrefix32(s, 0xd6d1ff31, 'StakeReturned');
        return {
            $: 'StakeReturned',
            queryId: s.loadUintBig(64),
            validator: s.loadAddress(),
            used: s.loadCoins(),
            returned: s.loadCoins(),
        }
    },
    store(self: StakeReturned, b: c.Builder): void {
        b.storeUint(0xd6d1ff31, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.validator);
        b.storeCoins(self.used);
        b.storeCoins(self.returned);
    },
    toCell(self: StakeReturned): c.Cell {
        return makeCellFrom<StakeReturned>(self, StakeReturned.store);
    }
}

/**
 > struct (0x21a6a2b3) RefundMessage {
 >     context: RefundContext
 > }
 */
export interface RefundMessage {
    readonly $: 'RefundMessage'
    context: RefundContext
}

export const RefundMessage = {
    PREFIX: 0x21a6a2b3,

    create(args: {
        context: RefundContext
    }): RefundMessage {
        return {
            $: 'RefundMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): RefundMessage {
        loadAndCheckPrefix32(s, 0x21a6a2b3, 'RefundMessage');
        return {
            $: 'RefundMessage',
            context: RefundContext.fromSlice(s),
        }
    },
    store(self: RefundMessage, b: c.Builder): void {
        b.storeUint(0x21a6a2b3, 32);
        RefundContext.store(self.context, b);
    },
    toCell(self: RefundMessage): c.Cell {
        return makeCellFrom<RefundMessage>(self, RefundMessage.store);
    }
}

/**
 > struct (0x219d71f5) AddValidator {
 >     queryId: uint64
 >     validator: address
 >     roundAllowance: RoundAllowance
 >     limits: ValidatorLimitTon | ValidatorLimitShare | null
 > }
 */
export interface AddValidator {
    readonly $: 'AddValidator'
    queryId: uint64
    validator: c.Address
    roundAllowance: RoundAllowance
    limits: ValidatorLimitTon | ValidatorLimitShare | null
}

export const AddValidator = {
    PREFIX: 0x219d71f5,

    create(args: {
        queryId: uint64
        validator: c.Address
        roundAllowance: RoundAllowance
        limits: ValidatorLimitTon | ValidatorLimitShare | null
    }): AddValidator {
        return {
            $: 'AddValidator',
            ...args
        }
    },
    fromSlice(s: c.Slice): AddValidator {
        loadAndCheckPrefix32(s, 0x219d71f5, 'AddValidator');
        return {
            $: 'AddValidator',
            queryId: s.loadUintBig(64),
            validator: s.loadAddress(),
            roundAllowance: RoundAllowance.fromSlice(s),
            limits: lookupPrefixAndEat(s, 0b10, 2) ? ValidatorLimitTon.fromSlice(s) :
                lookupPrefixAndEat(s, 0b11, 2) ? ValidatorLimitShare.fromSlice(s) :
                lookupPrefixAndEat(s, 0b0, 1) ? null :
                throwNonePrefixMatch('AddValidator.limits'),
        }
    },
    store(self: AddValidator, b: c.Builder): void {
        b.storeUint(0x219d71f5, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.validator);
        RoundAllowance.store(self.roundAllowance, b);
        if (self.limits === null) {
            b.storeUint(0b0, 1);
        } else switch (self.limits.$) {
            case 'ValidatorLimitTon':
                b.storeUint(0b10, 2);
                ValidatorLimitTon.store(self.limits, b);
                break;
            case 'ValidatorLimitShare':
                b.storeUint(0b11, 2);
                ValidatorLimitShare.store(self.limits, b);
                break;
        }
    },
    toCell(self: AddValidator): c.Cell {
        return makeCellFrom<AddValidator>(self, AddValidator.store);
    }
}

/**
 > struct (0x66d3ad60) RemoveValidator {
 >     queryId: uint64
 >     validator: address
 > }
 */
export interface RemoveValidator {
    readonly $: 'RemoveValidator'
    queryId: uint64
    validator: c.Address
}

export const RemoveValidator = {
    PREFIX: 0x66d3ad60,

    create(args: {
        queryId: uint64
        validator: c.Address
    }): RemoveValidator {
        return {
            $: 'RemoveValidator',
            ...args
        }
    },
    fromSlice(s: c.Slice): RemoveValidator {
        loadAndCheckPrefix32(s, 0x66d3ad60, 'RemoveValidator');
        return {
            $: 'RemoveValidator',
            queryId: s.loadUintBig(64),
            validator: s.loadAddress(),
        }
    },
    store(self: RemoveValidator, b: c.Builder): void {
        b.storeUint(0x66d3ad60, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.validator);
    },
    toCell(self: RemoveValidator): c.Cell {
        return makeCellFrom<RemoveValidator>(self, RemoveValidator.store);
    }
}

/**
 > struct (0x42a515de) AddFunds {
 >     queryId: uint64
 > }
 */
export interface AddFunds {
    readonly $: 'AddFunds'
    queryId: uint64
}

export const AddFunds = {
    PREFIX: 0x42a515de,

    create(args: {
        queryId: uint64
    }): AddFunds {
        return {
            $: 'AddFunds',
            ...args
        }
    },
    fromSlice(s: c.Slice): AddFunds {
        loadAndCheckPrefix32(s, 0x42a515de, 'AddFunds');
        return {
            $: 'AddFunds',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: AddFunds, b: c.Builder): void {
        b.storeUint(0x42a515de, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: AddFunds): c.Cell {
        return makeCellFrom<AddFunds>(self, AddFunds.store);
    }
}

/**
 > struct (0x11c31b99) OwnerWithdrawal {
 >     queryId: uint64
 >     amount: coins
 > }
 */
export interface OwnerWithdrawal {
    readonly $: 'OwnerWithdrawal'
    queryId: uint64
    amount: coins
}

export const OwnerWithdrawal = {
    PREFIX: 0x11c31b99,

    create(args: {
        queryId: uint64
        amount: coins
    }): OwnerWithdrawal {
        return {
            $: 'OwnerWithdrawal',
            ...args
        }
    },
    fromSlice(s: c.Slice): OwnerWithdrawal {
        loadAndCheckPrefix32(s, 0x11c31b99, 'OwnerWithdrawal');
        return {
            $: 'OwnerWithdrawal',
            queryId: s.loadUintBig(64),
            amount: s.loadCoins(),
        }
    },
    store(self: OwnerWithdrawal, b: c.Builder): void {
        b.storeUint(0x11c31b99, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.amount);
    },
    toCell(self: OwnerWithdrawal): c.Cell {
        return makeCellFrom<OwnerWithdrawal>(self, OwnerWithdrawal.store);
    }
}

/**
 > struct (0xf36da828) UpdateLimits {
 >     queryId: uint64
 >     limit: GlobalValidatorsLimit | GlobalNominatorsLimit | ValidatorSpecific
 > }
 */
export interface UpdateLimits {
    readonly $: 'UpdateLimits'
    queryId: uint64
    limit: GlobalValidatorsLimit | GlobalNominatorsLimit | ValidatorSpecific
}

export const UpdateLimits = {
    PREFIX: 0xf36da828,

    create(args: {
        queryId: uint64
        limit: GlobalValidatorsLimit | GlobalNominatorsLimit | ValidatorSpecific
    }): UpdateLimits {
        return {
            $: 'UpdateLimits',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpdateLimits {
        loadAndCheckPrefix32(s, 0xf36da828, 'UpdateLimits');
        return {
            $: 'UpdateLimits',
            queryId: s.loadUintBig(64),
            limit: lookupPrefixAndEat(s, 0b00, 2) ? GlobalValidatorsLimit.fromSlice(s) :
                lookupPrefixAndEat(s, 0b01, 2) ? GlobalNominatorsLimit.fromSlice(s) :
                lookupPrefixAndEat(s, 0b10, 2) ? ValidatorSpecific.fromSlice(s) :
                throwNonePrefixMatch('UpdateLimits.limit'),
        }
    },
    store(self: UpdateLimits, b: c.Builder): void {
        b.storeUint(0xf36da828, 32);
        b.storeUint(self.queryId, 64);
        switch (self.limit.$) {
            case 'GlobalValidatorsLimit':
                b.storeUint(0b00, 2);
                GlobalValidatorsLimit.store(self.limit, b);
                break;
            case 'GlobalNominatorsLimit':
                b.storeUint(0b01, 2);
                GlobalNominatorsLimit.store(self.limit, b);
                break;
            case 'ValidatorSpecific':
                b.storeUint(0b10, 2);
                ValidatorSpecific.store(self.limit, b);
                break;
        }
    },
    toCell(self: UpdateLimits): c.Cell {
        return makeCellFrom<UpdateLimits>(self, UpdateLimits.store);
    }
}

/**
 > struct (0xc2d9e5ad) UpdateNominatorsWhitelist {
 >     queryId: uint64
 >     whitelist: map<address, bool>
 > }
 */
export interface UpdateNominatorsWhitelist {
    readonly $: 'UpdateNominatorsWhitelist'
    queryId: uint64
    whitelist: c.Dictionary<c.Address, boolean>
}

export const UpdateNominatorsWhitelist = {
    PREFIX: 0xc2d9e5ad,

    create(args: {
        queryId: uint64
        whitelist: c.Dictionary<c.Address, boolean>
    }): UpdateNominatorsWhitelist {
        return {
            $: 'UpdateNominatorsWhitelist',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpdateNominatorsWhitelist {
        loadAndCheckPrefix32(s, 0xc2d9e5ad, 'UpdateNominatorsWhitelist');
        return {
            $: 'UpdateNominatorsWhitelist',
            queryId: s.loadUintBig(64),
            whitelist: c.Dictionary.load<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool(), s),
        }
    },
    store(self: UpdateNominatorsWhitelist, b: c.Builder): void {
        b.storeUint(0xc2d9e5ad, 32);
        b.storeUint(self.queryId, 64);
        b.storeDict<c.Address, boolean>(self.whitelist, c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    },
    toCell(self: UpdateNominatorsWhitelist): c.Cell {
        return makeCellFrom<UpdateNominatorsWhitelist>(self, UpdateNominatorsWhitelist.store);
    }
}

/**
 > struct (0x43921f80) OwnerWithdrawalSuccess {
 >     queryId: uint64
 > }
 */
export interface OwnerWithdrawalSuccess {
    readonly $: 'OwnerWithdrawalSuccess'
    queryId: uint64
}

export const OwnerWithdrawalSuccess = {
    PREFIX: 0x43921f80,

    create(args: {
        queryId: uint64
    }): OwnerWithdrawalSuccess {
        return {
            $: 'OwnerWithdrawalSuccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): OwnerWithdrawalSuccess {
        loadAndCheckPrefix32(s, 0x43921f80, 'OwnerWithdrawalSuccess');
        return {
            $: 'OwnerWithdrawalSuccess',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: OwnerWithdrawalSuccess, b: c.Builder): void {
        b.storeUint(0x43921f80, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: OwnerWithdrawalSuccess): c.Cell {
        return makeCellFrom<OwnerWithdrawalSuccess>(self, OwnerWithdrawalSuccess.store);
    }
}

/**
 > struct (0xe4649054) RoundInfoMessage {
 >     queryId: uint64
 >     info: RoundInfo
 > }
 */
export interface RoundInfoMessage {
    readonly $: 'RoundInfoMessage'
    queryId: uint64
    info: RoundInfo
}

export const RoundInfoMessage = {
    PREFIX: 0xe4649054,

    create(args: {
        queryId: uint64
        info: RoundInfo
    }): RoundInfoMessage {
        return {
            $: 'RoundInfoMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): RoundInfoMessage {
        loadAndCheckPrefix32(s, 0xe4649054, 'RoundInfoMessage');
        return {
            $: 'RoundInfoMessage',
            queryId: s.loadUintBig(64),
            info: RoundInfo.fromSlice(s),
        }
    },
    store(self: RoundInfoMessage, b: c.Builder): void {
        b.storeUint(0xe4649054, 32);
        b.storeUint(self.queryId, 64);
        RoundInfo.store(self.info, b);
    },
    toCell(self: RoundInfoMessage): c.Cell {
        return makeCellFrom<RoundInfoMessage>(self, RoundInfoMessage.store);
    }
}

/**
 > struct Nominator {
 >     share: coins
 >     tonAmount: coins
 >     pendingDeposit: coins
 >     pendingWithdrawal: coins
 >     depositIndex: uint64
 >     withdrawalIndex: uint64
 > }
 */
export interface Nominator {
    readonly $: 'Nominator'
    share: coins
    tonAmount: coins
    pendingDeposit: coins /* = 0 */
    pendingWithdrawal: coins /* = 0 */
    depositIndex: uint64 /* = 0 */
    withdrawalIndex: uint64 /* = 0 */
}

export const Nominator = {
    create(args: {
        share: coins
        tonAmount: coins
        pendingDeposit?: coins /* = 0 */
        pendingWithdrawal?: coins /* = 0 */
        depositIndex?: uint64 /* = 0 */
        withdrawalIndex?: uint64 /* = 0 */
    }): Nominator {
        return {
            $: 'Nominator',
            pendingDeposit: 0n,
            pendingWithdrawal: 0n,
            depositIndex: 0n,
            withdrawalIndex: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): Nominator {
        return {
            $: 'Nominator',
            share: s.loadCoins(),
            tonAmount: s.loadCoins(),
            pendingDeposit: s.loadCoins(),
            pendingWithdrawal: s.loadCoins(),
            depositIndex: s.loadUintBig(64),
            withdrawalIndex: s.loadUintBig(64),
        }
    },
    store(self: Nominator, b: c.Builder): void {
        b.storeCoins(self.share);
        b.storeCoins(self.tonAmount);
        b.storeCoins(self.pendingDeposit);
        b.storeCoins(self.pendingWithdrawal);
        b.storeUint(self.depositIndex, 64);
        b.storeUint(self.withdrawalIndex, 64);
    },
    toCell(self: Nominator): c.Cell {
        return makeCellFrom<Nominator>(self, Nominator.store);
    }
}

/**
 > struct NominatorsSettings {
 >     maxNominators: uint10
 >     minStake: coins
 >     minWithdrawableRewards: coins
 >     whitelist: map<address, bool>
 > }
 */
export interface NominatorsSettings {
    readonly $: 'NominatorsSettings'
    maxNominators: uint10
    minStake: coins
    minWithdrawableRewards: coins
    whitelist: c.Dictionary<c.Address, boolean> /* = [] as map<address, bool> */
}

export const NominatorsSettings = {
    create(args: {
        maxNominators: uint10
        minStake: coins
        minWithdrawableRewards: coins
        whitelist: c.Dictionary<c.Address, boolean> /* = [] as map<address, bool> */
    }): NominatorsSettings {
        return {
            $: 'NominatorsSettings',
            ...args
        }
    },
    fromSlice(s: c.Slice): NominatorsSettings {
        return {
            $: 'NominatorsSettings',
            maxNominators: s.loadUintBig(10),
            minStake: s.loadCoins(),
            minWithdrawableRewards: s.loadCoins(),
            whitelist: c.Dictionary.load<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool(), s),
        }
    },
    store(self: NominatorsSettings, b: c.Builder): void {
        b.storeUint(self.maxNominators, 10);
        b.storeCoins(self.minStake);
        b.storeCoins(self.minWithdrawableRewards);
        b.storeDict<c.Address, boolean>(self.whitelist, c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    },
    toCell(self: NominatorsSettings): c.Cell {
        return makeCellFrom<NominatorsSettings>(self, NominatorsSettings.store);
    }
}

/**
 > struct RoundInfo {
 >     used: coins
 >     returned: coins
 >     roundIndex: uint64
 > }
 */
export interface RoundInfo {
    readonly $: 'RoundInfo'
    used: coins /* = 0 */
    returned: coins /* = 0 */
    roundIndex: uint64
}

export const RoundInfo = {
    create(args: {
        used?: coins /* = 0 */
        returned?: coins /* = 0 */
        roundIndex: uint64
    }): RoundInfo {
        return {
            $: 'RoundInfo',
            used: 0n,
            returned: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): RoundInfo {
        return {
            $: 'RoundInfo',
            used: s.loadCoins(),
            returned: s.loadCoins(),
            roundIndex: s.loadUintBig(64),
        }
    },
    store(self: RoundInfo, b: c.Builder): void {
        b.storeCoins(self.used);
        b.storeCoins(self.returned);
        b.storeUint(self.roundIndex, 64);
    },
    toCell(self: RoundInfo): c.Cell {
        return makeCellFrom<RoundInfo>(self, RoundInfo.store);
    }
}

/**
 > struct RoundData {
 >     used: coins
 >     returned: coins
 >     roundIndex: uint64
 >     users: map<uint256, TonUsage>
 > }
 */
export interface RoundData {
    readonly $: 'RoundData'
    used: coins /* = 0 */
    returned: coins /* = 0 */
    roundIndex: uint64
    users: c.Dictionary<uint256, TonUsage> /* = [] as map<uint256, TonUsage> */
}

export const RoundData = {
    create(args: {
        used?: coins /* = 0 */
        returned?: coins /* = 0 */
        roundIndex: uint64
        users: c.Dictionary<uint256, TonUsage> /* = [] as map<uint256, TonUsage> */
    }): RoundData {
        return {
            $: 'RoundData',
            used: 0n,
            returned: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): RoundData {
        return {
            $: 'RoundData',
            used: s.loadCoins(),
            returned: s.loadCoins(),
            roundIndex: s.loadUintBig(64),
            users: c.Dictionary.load<uint256, TonUsage>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<TonUsage>(TonUsage.fromSlice, TonUsage.store), s),
        }
    },
    store(self: RoundData, b: c.Builder): void {
        b.storeCoins(self.used);
        b.storeCoins(self.returned);
        b.storeUint(self.roundIndex, 64);
        b.storeDict<uint256, TonUsage>(self.users, c.Dictionary.Keys.BigUint(256), createDictionaryValue<TonUsage>(TonUsage.fromSlice, TonUsage.store));
    },
    toCell(self: RoundData): c.Cell {
        return makeCellFrom<RoundData>(self, RoundData.store);
    }
}

/**
 > struct ValidatorsData {
 >     mainValidatorAddress: address
 >     vsetHash: uint128
 >     mainValidatorData: Cell<Validator>
 >     activeValidators: uint6
 >     activeSlots: uint7
 >     stakeUsed: coins
 >     minTonPerValidator: coins
 >     maxTonPerValidator: coins
 >     refundBonus: uint33
 >     validators: map<address, Validator>
 >     curRound: Cell<RoundData>
 >     prevRound: Cell<RoundData>
 > }
 */
export interface ValidatorsData {
    readonly $: 'ValidatorsData'
    mainValidatorAddress: c.Address
    vsetHash: uint128
    mainValidatorData: CellRef<Validator>
    activeValidators: uint6 /* = 1 */
    activeSlots: uint7 /* = 0 */
    stakeUsed: coins /* = 0 */
    minTonPerValidator: coins
    maxTonPerValidator: coins
    refundBonus: uint33 /* = 3000000000 as coins as int */
    validators: c.Dictionary<c.Address, Validator> /* = [] as map<address, Validator> */
    curRound: CellRef<RoundData>
    prevRound: CellRef<RoundData>
}

export const ValidatorsData = {
    create(args: {
        mainValidatorAddress: c.Address
        vsetHash: uint128
        mainValidatorData: CellRef<Validator>
        activeValidators?: uint6 /* = 1 */
        activeSlots?: uint7 /* = 0 */
        stakeUsed?: coins /* = 0 */
        minTonPerValidator: coins
        maxTonPerValidator: coins
        refundBonus?: uint33 /* = 3000000000 as coins as int */
        validators: c.Dictionary<c.Address, Validator> /* = [] as map<address, Validator> */
        curRound: CellRef<RoundData>
        prevRound: CellRef<RoundData>
    }): ValidatorsData {
        return {
            $: 'ValidatorsData',
            activeValidators: 1n,
            activeSlots: 0n,
            stakeUsed: 0n,
            refundBonus: 3000000000n,
            ...args
        }
    },
    fromSlice(s: c.Slice): ValidatorsData {
        return {
            $: 'ValidatorsData',
            mainValidatorAddress: s.loadAddress(),
            vsetHash: s.loadUintBig(128),
            mainValidatorData: loadCellRef<Validator>(s, Validator.fromSlice),
            activeValidators: s.loadUintBig(6),
            activeSlots: s.loadUintBig(7),
            stakeUsed: s.loadCoins(),
            minTonPerValidator: s.loadCoins(),
            maxTonPerValidator: s.loadCoins(),
            refundBonus: s.loadUintBig(33),
            validators: c.Dictionary.load<c.Address, Validator>(c.Dictionary.Keys.Address(), createDictionaryValue<Validator>(Validator.fromSlice, Validator.store), s),
            curRound: loadCellRef<RoundData>(s, RoundData.fromSlice),
            prevRound: loadCellRef<RoundData>(s, RoundData.fromSlice),
        }
    },
    store(self: ValidatorsData, b: c.Builder): void {
        b.storeAddress(self.mainValidatorAddress);
        b.storeUint(self.vsetHash, 128);
        storeCellRef<Validator>(self.mainValidatorData, b, Validator.store);
        b.storeUint(self.activeValidators, 6);
        b.storeUint(self.activeSlots, 7);
        b.storeCoins(self.stakeUsed);
        b.storeCoins(self.minTonPerValidator);
        b.storeCoins(self.maxTonPerValidator);
        b.storeUint(self.refundBonus, 33);
        b.storeDict<c.Address, Validator>(self.validators, c.Dictionary.Keys.Address(), createDictionaryValue<Validator>(Validator.fromSlice, Validator.store));
        storeCellRef<RoundData>(self.curRound, b, RoundData.store);
        storeCellRef<RoundData>(self.prevRound, b, RoundData.store);
    },
    toCell(self: ValidatorsData): c.Cell {
        return makeCellFrom<ValidatorsData>(self, ValidatorsData.store);
    }
}

/**
 > struct ValidatorLimitTon {
 >     maxTon: coins
 > }
 */
export interface ValidatorLimitTon {
    readonly $: 'ValidatorLimitTon'
    maxTon: coins
}

export const ValidatorLimitTon = {
    create(args: {
        maxTon: coins
    }): ValidatorLimitTon {
        return {
            $: 'ValidatorLimitTon',
            ...args
        }
    },
    fromSlice(s: c.Slice): ValidatorLimitTon {
        return {
            $: 'ValidatorLimitTon',
            maxTon: s.loadCoins(),
        }
    },
    store(self: ValidatorLimitTon, b: c.Builder): void {
        b.storeCoins(self.maxTon);
    },
    toCell(self: ValidatorLimitTon): c.Cell {
        return makeCellFrom<ValidatorLimitTon>(self, ValidatorLimitTon.store);
    }
}

/**
 > struct ValidatorLimitShare {
 >     maxShare: uint25
 > }
 */
export interface ValidatorLimitShare {
    readonly $: 'ValidatorLimitShare'
    maxShare: uint25
}

export const ValidatorLimitShare = {
    create(args: {
        maxShare: uint25
    }): ValidatorLimitShare {
        return {
            $: 'ValidatorLimitShare',
            ...args
        }
    },
    fromSlice(s: c.Slice): ValidatorLimitShare {
        return {
            $: 'ValidatorLimitShare',
            maxShare: s.loadUintBig(25),
        }
    },
    store(self: ValidatorLimitShare, b: c.Builder): void {
        b.storeUint(self.maxShare, 25);
    },
    toCell(self: ValidatorLimitShare): c.Cell {
        return makeCellFrom<ValidatorLimitShare>(self, ValidatorLimitShare.store);
    }
}

/**
 > type ValidatorLimit = ValidatorLimitTon | ValidatorLimitShare
 */
export type ValidatorLimit =
    | ValidatorLimitTon
    | ValidatorLimitShare

export const ValidatorLimit = {
    fromSlice(s: c.Slice): ValidatorLimit {
        return s.loadBoolean() ? ValidatorLimitShare.fromSlice(s) : ValidatorLimitTon.fromSlice(s);
    },
    store(self: ValidatorLimit, b: c.Builder): void {
        switch (self.$) {
            case 'ValidatorLimitTon':
                b.storeUint(0b0, 1);
                ValidatorLimitTon.store(self, b);
                break;
            case 'ValidatorLimitShare':
                b.storeUint(0b1, 1);
                ValidatorLimitShare.store(self, b);
                break;
        }
    },
    toCell(self: ValidatorLimit): c.Cell {
        return makeCellFrom<ValidatorLimit>(self, ValidatorLimit.store);
    }
}

/**
 > struct GlobalValidatorsLimit {
 >     minTonPerValidator: coins
 >     maxTonPerValidator: coins
 >     refundBonus: uint33
 > }
 */
export interface GlobalValidatorsLimit {
    readonly $: 'GlobalValidatorsLimit'
    minTonPerValidator: coins
    maxTonPerValidator: coins
    refundBonus: uint33
}

export const GlobalValidatorsLimit = {
    create(args: {
        minTonPerValidator: coins
        maxTonPerValidator: coins
        refundBonus: uint33
    }): GlobalValidatorsLimit {
        return {
            $: 'GlobalValidatorsLimit',
            ...args
        }
    },
    fromSlice(s: c.Slice): GlobalValidatorsLimit {
        return {
            $: 'GlobalValidatorsLimit',
            minTonPerValidator: s.loadCoins(),
            maxTonPerValidator: s.loadCoins(),
            refundBonus: s.loadUintBig(33),
        }
    },
    store(self: GlobalValidatorsLimit, b: c.Builder): void {
        b.storeCoins(self.minTonPerValidator);
        b.storeCoins(self.maxTonPerValidator);
        b.storeUint(self.refundBonus, 33);
    },
    toCell(self: GlobalValidatorsLimit): c.Cell {
        return makeCellFrom<GlobalValidatorsLimit>(self, GlobalValidatorsLimit.store);
    }
}

/**
 > struct GlobalNominatorsLimit {
 >     minStake: coins
 >     maxNm: uint10
 > }
 */
export interface GlobalNominatorsLimit {
    readonly $: 'GlobalNominatorsLimit'
    minStake: coins
    maxNm: uint10
}

export const GlobalNominatorsLimit = {
    create(args: {
        minStake: coins
        maxNm: uint10
    }): GlobalNominatorsLimit {
        return {
            $: 'GlobalNominatorsLimit',
            ...args
        }
    },
    fromSlice(s: c.Slice): GlobalNominatorsLimit {
        return {
            $: 'GlobalNominatorsLimit',
            minStake: s.loadCoins(),
            maxNm: s.loadUintBig(10),
        }
    },
    store(self: GlobalNominatorsLimit, b: c.Builder): void {
        b.storeCoins(self.minStake);
        b.storeUint(self.maxNm, 10);
    },
    toCell(self: GlobalNominatorsLimit): c.Cell {
        return makeCellFrom<GlobalNominatorsLimit>(self, GlobalNominatorsLimit.store);
    }
}

/**
 > struct ValidatorSpecific {
 >     validator: address
 >     limit: ValidatorLimit
 > }
 */
export interface ValidatorSpecific {
    readonly $: 'ValidatorSpecific'
    validator: c.Address
    limit: ValidatorLimit
}

export const ValidatorSpecific = {
    create(args: {
        validator: c.Address
        limit: ValidatorLimit
    }): ValidatorSpecific {
        return {
            $: 'ValidatorSpecific',
            ...args
        }
    },
    fromSlice(s: c.Slice): ValidatorSpecific {
        return {
            $: 'ValidatorSpecific',
            validator: s.loadAddress(),
            limit: ValidatorLimit.fromSlice(s),
        }
    },
    store(self: ValidatorSpecific, b: c.Builder): void {
        b.storeAddress(self.validator);
        ValidatorLimit.store(self.limit, b);
    },
    toCell(self: ValidatorSpecific): c.Cell {
        return makeCellFrom<ValidatorSpecific>(self, ValidatorSpecific.store);
    }
}

/**
 > enum RoundAllowance { 3 variants }
 */
export type RoundAllowance = bigint

export const RoundAllowance = {
    InOddRounds: 1n,
    InEvenRounds: 2n,
    InAllRounds: 3n,

    fromSlice(s: c.Slice): RoundAllowance {
        return s.loadUintBig(2);
    },
    store(self: RoundAllowance, b: c.Builder): void {
        b.storeUint(self, 2);
    },
    toCell(self: RoundAllowance): c.Cell {
        return makeCellFrom<RoundAllowance>(self, RoundAllowance.store);
    }
}

/**
 > struct RotationData {
 >     vsetHash: uint256
 >     rotationTime: uint32
 >     rotationCount: uint8
 > }
 */
export interface RotationData {
    readonly $: 'RotationData'
    vsetHash: uint256
    rotationTime: uint32
    rotationCount: uint8 /* = 0 */
}

export const RotationData = {
    create(args: {
        vsetHash: uint256
        rotationTime: uint32
        rotationCount?: uint8 /* = 0 */
    }): RotationData {
        return {
            $: 'RotationData',
            rotationCount: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): RotationData {
        return {
            $: 'RotationData',
            vsetHash: s.loadUintBig(256),
            rotationTime: s.loadUintBig(32),
            rotationCount: s.loadUintBig(8),
        }
    },
    store(self: RotationData, b: c.Builder): void {
        b.storeUint(self.vsetHash, 256);
        b.storeUint(self.rotationTime, 32);
        b.storeUint(self.rotationCount, 8);
    },
    toCell(self: RotationData): c.Cell {
        return makeCellFrom<RotationData>(self, RotationData.store);
    }
}

/**
 > struct Validator {
 >     isBanned: bool
 >     usageState: uint2
 >     evenProxy: uint256?
 >     oddProxy: uint256?
 >     limit: ValidatorLimitTon | ValidatorLimitShare | null
 >     roundParity: RoundAllowance
 > }
 */
export interface Validator {
    readonly $: 'Validator'
    isBanned: boolean /* = false */
    usageState: uint2
    evenProxy: uint256 | null /* = null */
    oddProxy: uint256 | null /* = null */
    limit: ValidatorLimitTon | ValidatorLimitShare | null /* = null */
    roundParity: RoundAllowance
}

export const Validator = {
    create(args: {
        isBanned?: boolean /* = false */
        usageState: uint2
        evenProxy?: uint256 | null /* = null */
        oddProxy?: uint256 | null /* = null */
        limit: ValidatorLimitTon | ValidatorLimitShare | null /* = null */
        roundParity: RoundAllowance
    }): Validator {
        return {
            $: 'Validator',
            isBanned: false,
            evenProxy: null,
            oddProxy: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): Validator {
        return {
            $: 'Validator',
            isBanned: s.loadBoolean(),
            usageState: s.loadUintBig(2),
            evenProxy: s.loadBoolean() ? s.loadUintBig(256) : null,
            oddProxy: s.loadBoolean() ? s.loadUintBig(256) : null,
            limit: lookupPrefixAndEat(s, 0b10, 2) ? ValidatorLimitTon.fromSlice(s) :
                lookupPrefixAndEat(s, 0b11, 2) ? ValidatorLimitShare.fromSlice(s) :
                lookupPrefixAndEat(s, 0b0, 1) ? null :
                throwNonePrefixMatch('Validator.limit'),
            roundParity: RoundAllowance.fromSlice(s),
        }
    },
    store(self: Validator, b: c.Builder): void {
        b.storeBit(self.isBanned);
        b.storeUint(self.usageState, 2);
        storeTolkNullable<uint256>(self.evenProxy, b,
            (v,b) => b.storeUint(v, 256)
        );
        storeTolkNullable<uint256>(self.oddProxy, b,
            (v,b) => b.storeUint(v, 256)
        );
        if (self.limit === null) {
            b.storeUint(0b0, 1);
        } else switch (self.limit.$) {
            case 'ValidatorLimitTon':
                b.storeUint(0b10, 2);
                ValidatorLimitTon.store(self.limit, b);
                break;
            case 'ValidatorLimitShare':
                b.storeUint(0b11, 2);
                ValidatorLimitShare.store(self.limit, b);
                break;
        }
        RoundAllowance.store(self.roundParity, b);
    },
    toCell(self: Validator): c.Cell {
        return makeCellFrom<Validator>(self, Validator.store);
    }
}

/**
 > struct Distribution {
 >     pendingShare: coins
 >     pendingCoins: coins
 > }
 */
export interface Distribution {
    readonly $: 'Distribution'
    pendingShare: coins /* = 0 */
    pendingCoins: coins /* = 0 */
}

export const Distribution = {
    create(args: {
        pendingShare?: coins /* = 0 */
        pendingCoins?: coins /* = 0 */
    }): Distribution {
        return {
            $: 'Distribution',
            pendingShare: 0n,
            pendingCoins: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): Distribution {
        return {
            $: 'Distribution',
            pendingShare: s.loadCoins(),
            pendingCoins: s.loadCoins(),
        }
    },
    store(self: Distribution, b: c.Builder): void {
        b.storeCoins(self.pendingShare);
        b.storeCoins(self.pendingCoins);
    },
    toCell(self: Distribution): c.Cell {
        return makeCellFrom<Distribution>(self, Distribution.store);
    }
}

/**
 > struct PendingOps {
 >     cur: address?
 >     prev: address?
 >     next: address?
 >     nextStateInit: Cell<StateInit>?
 >     index: uint64
 >     isWithdraw: bool
 > }
 */
export interface PendingOps {
    readonly $: 'PendingOps'
    cur: c.Address | null /* = null */
    prev: c.Address | null /* = null */
    next: c.Address | null /* = null */
    nextStateInit: CellRef<StateInit> | null /* = null */
    index: uint64 /* = 0 */
    isWithdraw: boolean
}

export const PendingOps = {
    create(args: {
        cur?: c.Address | null /* = null */
        prev?: c.Address | null /* = null */
        next?: c.Address | null /* = null */
        nextStateInit?: CellRef<StateInit> | null /* = null */
        index?: uint64 /* = 0 */
        isWithdraw: boolean
    }): PendingOps {
        return {
            $: 'PendingOps',
            cur: null,
            prev: null,
            next: null,
            nextStateInit: null,
            index: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): PendingOps {
        return {
            $: 'PendingOps',
            cur: s.loadMaybeAddress(),
            prev: s.loadMaybeAddress(),
            next: s.loadMaybeAddress(),
            nextStateInit: s.loadBoolean() ? loadCellRef<StateInit>(s, StateInit.fromSlice) : null,
            index: s.loadUintBig(64),
            isWithdraw: s.loadBoolean(),
        }
    },
    store(self: PendingOps, b: c.Builder): void {
        b.storeAddress(self.cur);
        b.storeAddress(self.prev);
        b.storeAddress(self.next);
        storeTolkNullable<CellRef<StateInit>>(self.nextStateInit, b,
            (v,b) => storeCellRef<StateInit>(v, b, StateInit.store)
        );
        b.storeUint(self.index, 64);
        b.storeBit(self.isWithdraw);
    },
    toCell(self: PendingOps): c.Cell {
        return makeCellFrom<PendingOps>(self, PendingOps.store);
    }
}

/**
 > struct NominatorsData {
 >     nmCount: uint16
 >     minStake: coins
 >     minWithdrawableReward: coins
 >     poolNominators: map<address, Nominator>
 >     pendingDeposits: Cell<PendingOps>?
 >     pendingWithdrawals: Cell<PendingOps>?
 >     nominatorsWhitelist: map<address, bool>
 > }
 */
export interface NominatorsData {
    readonly $: 'NominatorsData'
    nmCount: uint16 /* = 0 */
    minStake: coins
    minWithdrawableReward: coins
    poolNominators: c.Dictionary<c.Address, Nominator> /* = [] as map<address, Nominator> */
    pendingDeposits: CellRef<PendingOps> | null /* = null */
    pendingWithdrawals: CellRef<PendingOps> | null /* = null */
    nominatorsWhitelist: c.Dictionary<c.Address, boolean> /* = [] as map<address, bool> */
}

export const NominatorsData = {
    create(args: {
        nmCount?: uint16 /* = 0 */
        minStake: coins
        minWithdrawableReward: coins
        poolNominators: c.Dictionary<c.Address, Nominator> /* = [] as map<address, Nominator> */
        pendingDeposits?: CellRef<PendingOps> | null /* = null */
        pendingWithdrawals?: CellRef<PendingOps> | null /* = null */
        nominatorsWhitelist: c.Dictionary<c.Address, boolean> /* = [] as map<address, bool> */
    }): NominatorsData {
        return {
            $: 'NominatorsData',
            nmCount: 0n,
            pendingDeposits: null,
            pendingWithdrawals: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): NominatorsData {
        return {
            $: 'NominatorsData',
            nmCount: s.loadUintBig(16),
            minStake: s.loadCoins(),
            minWithdrawableReward: s.loadCoins(),
            poolNominators: c.Dictionary.load<c.Address, Nominator>(c.Dictionary.Keys.Address(), createDictionaryValue<Nominator>(Nominator.fromSlice, Nominator.store), s),
            pendingDeposits: s.loadBoolean() ? loadCellRef<PendingOps>(s, PendingOps.fromSlice) : null,
            pendingWithdrawals: s.loadBoolean() ? loadCellRef<PendingOps>(s, PendingOps.fromSlice) : null,
            nominatorsWhitelist: c.Dictionary.load<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool(), s),
        }
    },
    store(self: NominatorsData, b: c.Builder): void {
        b.storeUint(self.nmCount, 16);
        b.storeCoins(self.minStake);
        b.storeCoins(self.minWithdrawableReward);
        b.storeDict<c.Address, Nominator>(self.poolNominators, c.Dictionary.Keys.Address(), createDictionaryValue<Nominator>(Nominator.fromSlice, Nominator.store));
        storeTolkNullable<CellRef<PendingOps>>(self.pendingDeposits, b,
            (v,b) => storeCellRef<PendingOps>(v, b, PendingOps.store)
        );
        storeTolkNullable<CellRef<PendingOps>>(self.pendingWithdrawals, b,
            (v,b) => storeCellRef<PendingOps>(v, b, PendingOps.store)
        );
        b.storeDict<c.Address, boolean>(self.nominatorsWhitelist, c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    },
    toCell(self: NominatorsData): c.Cell {
        return makeCellFrom<NominatorsData>(self, NominatorsData.store);
    }
}

/**
 > struct TonUsage {
 >     heldFor: uint32
 >     tonUsed: coins
 >     validator: address
 >     rotation: RotationData
 > }
 */
export interface TonUsage {
    readonly $: 'TonUsage'
    heldFor: uint32
    tonUsed: coins
    validator: c.Address
    rotation: RotationData
}

export const TonUsage = {
    create(args: {
        heldFor: uint32
        tonUsed: coins
        validator: c.Address
        rotation: RotationData
    }): TonUsage {
        return {
            $: 'TonUsage',
            ...args
        }
    },
    fromSlice(s: c.Slice): TonUsage {
        return {
            $: 'TonUsage',
            heldFor: s.loadUintBig(32),
            tonUsed: s.loadCoins(),
            validator: s.loadAddress(),
            rotation: RotationData.fromSlice(s),
        }
    },
    store(self: TonUsage, b: c.Builder): void {
        b.storeUint(self.heldFor, 32);
        b.storeCoins(self.tonUsed);
        b.storeAddress(self.validator);
        RotationData.store(self.rotation, b);
    },
    toCell(self: TonUsage): c.Cell {
        return makeCellFrom<TonUsage>(self, TonUsage.store);
    }
}

/**
 > struct GetValidatorInfo {
 >     validator: Validator
 >     usage: ValidatorUsageRecords
 >     stakeable: coins
 >     roundIndex: uint64
 >     rotated: bool
 > }
 */
export interface GetValidatorInfo {
    readonly $: 'GetValidatorInfo'
    validator: Validator
    usage: ValidatorUsageRecords
    stakeable: coins
    roundIndex: uint64
    rotated: boolean
}

export const GetValidatorInfo = {
    create(args: {
        validator: Validator
        usage: ValidatorUsageRecords
        stakeable: coins
        roundIndex: uint64
        rotated: boolean
    }): GetValidatorInfo {
        return {
            $: 'GetValidatorInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): GetValidatorInfo {
        return {
            $: 'GetValidatorInfo',
            validator: Validator.fromSlice(s),
            usage: ValidatorUsageRecords.fromSlice(s),
            stakeable: s.loadCoins(),
            roundIndex: s.loadUintBig(64),
            rotated: s.loadBoolean(),
        }
    },
    store(self: GetValidatorInfo, b: c.Builder): void {
        Validator.store(self.validator, b);
        ValidatorUsageRecords.store(self.usage, b);
        b.storeCoins(self.stakeable);
        b.storeUint(self.roundIndex, 64);
        b.storeBit(self.rotated);
    },
    toCell(self: GetValidatorInfo): c.Cell {
        return makeCellFrom<GetValidatorInfo>(self, GetValidatorInfo.store);
    }
}

/**
 > struct ValidatorUsageStats {
 >     proxy: uint256
 >     usage: TonUsage
 > }
 */
export interface ValidatorUsageStats {
    readonly $: 'ValidatorUsageStats'
    proxy: uint256
    usage: TonUsage
}

export const ValidatorUsageStats = {
    create(args: {
        proxy: uint256
        usage: TonUsage
    }): ValidatorUsageStats {
        return {
            $: 'ValidatorUsageStats',
            ...args
        }
    },
    fromSlice(s: c.Slice): ValidatorUsageStats {
        return {
            $: 'ValidatorUsageStats',
            proxy: s.loadUintBig(256),
            usage: TonUsage.fromSlice(s),
        }
    },
    store(self: ValidatorUsageStats, b: c.Builder): void {
        b.storeUint(self.proxy, 256);
        TonUsage.store(self.usage, b);
    },
    toCell(self: ValidatorUsageStats): c.Cell {
        return makeCellFrom<ValidatorUsageStats>(self, ValidatorUsageStats.store);
    }
}

/**
 > struct ValidatorUsageRecords {
 >     curRoundUsage: ValidatorUsageStats?
 >     prevRoundUsage: ValidatorUsageStats?
 > }
 */
export interface ValidatorUsageRecords {
    readonly $: 'ValidatorUsageRecords'
    curRoundUsage: ValidatorUsageStats | null
    prevRoundUsage: ValidatorUsageStats | null
}

export const ValidatorUsageRecords = {
    create(args: {
        curRoundUsage: ValidatorUsageStats | null
        prevRoundUsage: ValidatorUsageStats | null
    }): ValidatorUsageRecords {
        return {
            $: 'ValidatorUsageRecords',
            ...args
        }
    },
    fromSlice(s: c.Slice): ValidatorUsageRecords {
        return {
            $: 'ValidatorUsageRecords',
            curRoundUsage: s.loadBoolean() ? ValidatorUsageStats.fromSlice(s) : null,
            prevRoundUsage: s.loadBoolean() ? ValidatorUsageStats.fromSlice(s) : null,
        }
    },
    store(self: ValidatorUsageRecords, b: c.Builder): void {
        storeTolkNullable<ValidatorUsageStats>(self.curRoundUsage, b, ValidatorUsageStats.store);
        storeTolkNullable<ValidatorUsageStats>(self.prevRoundUsage, b, ValidatorUsageStats.store);
    },
    toCell(self: ValidatorUsageRecords): c.Cell {
        return makeCellFrom<ValidatorUsageRecords>(self, ValidatorUsageRecords.store);
    }
}

/**
 > struct (0b0) PoolStorageNotInitialized {
 >     owner: address
 >     poolId: uint32
 > }
 */
export interface PoolStorageNotInitialized {
    readonly $: 'PoolStorageNotInitialized'
    owner: c.Address
    poolId: uint32
}

export const PoolStorageNotInitialized = {
    PREFIX: 0b0,

    create(args: {
        owner: c.Address
        poolId: uint32
    }): PoolStorageNotInitialized {
        return {
            $: 'PoolStorageNotInitialized',
            ...args
        }
    },
    fromSlice(s: c.Slice): PoolStorageNotInitialized {
        loadAndCheckPrefix(s, 0b0, 1, 'PoolStorageNotInitialized');
        return {
            $: 'PoolStorageNotInitialized',
            owner: s.loadAddress(),
            poolId: s.loadUintBig(32),
        }
    },
    store(self: PoolStorageNotInitialized, b: c.Builder): void {
        b.storeUint(0b0, 1);
        b.storeAddress(self.owner);
        b.storeUint(self.poolId, 32);
    },
    toCell(self: PoolStorageNotInitialized): c.Cell {
        return makeCellFrom<PoolStorageNotInitialized>(self, PoolStorageNotInitialized.store);
    }
}

/**
 > struct (0b1) Storage {
 >     owner: address
 >     poolId: uint32
 >     halted: bool
 >     ownerShare: uint25
 >     poolSupply: coins
 >     roundClosed: bool
 >     roundIndex: uint64
 >     validators: Cell<ValidatorsData>
 >     nominators: Cell<NominatorsData>
 >     maxNominators: uint10
 >     nominatorsAmount: coins
 >     pendingDeposits: coins
 >     pendingWithdrawals: coins
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    owner: c.Address
    poolId: uint32 /* = 0 */
    halted: boolean /* = false */
    ownerShare: uint25
    poolSupply: coins /* = 0 */
    roundClosed: boolean /* = false */
    roundIndex: uint64 /* = 0 */
    validators: CellRef<ValidatorsData>
    nominators: CellRef<NominatorsData>
    maxNominators: uint10
    nominatorsAmount: coins /* = 0 */
    pendingDeposits: coins /* = 0 */
    pendingWithdrawals: coins /* = 0 */
}

export const Storage = {
    PREFIX: 0b1,

    create(args: {
        owner: c.Address
        poolId?: uint32 /* = 0 */
        halted?: boolean /* = false */
        ownerShare: uint25
        poolSupply?: coins /* = 0 */
        roundClosed?: boolean /* = false */
        roundIndex?: uint64 /* = 0 */
        validators: CellRef<ValidatorsData>
        nominators: CellRef<NominatorsData>
        maxNominators: uint10
        nominatorsAmount?: coins /* = 0 */
        pendingDeposits?: coins /* = 0 */
        pendingWithdrawals?: coins /* = 0 */
    }): Storage {
        return {
            $: 'Storage',
            poolId: 0n,
            halted: false,
            poolSupply: 0n,
            roundClosed: false,
            roundIndex: 0n,
            nominatorsAmount: 0n,
            pendingDeposits: 0n,
            pendingWithdrawals: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        loadAndCheckPrefix(s, 0b1, 1, 'Storage');
        return {
            $: 'Storage',
            owner: s.loadAddress(),
            poolId: s.loadUintBig(32),
            halted: s.loadBoolean(),
            ownerShare: s.loadUintBig(25),
            poolSupply: s.loadCoins(),
            roundClosed: s.loadBoolean(),
            roundIndex: s.loadUintBig(64),
            validators: loadCellRef<ValidatorsData>(s, ValidatorsData.fromSlice),
            nominators: loadCellRef<NominatorsData>(s, NominatorsData.fromSlice),
            maxNominators: s.loadUintBig(10),
            nominatorsAmount: s.loadCoins(),
            pendingDeposits: s.loadCoins(),
            pendingWithdrawals: s.loadCoins(),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeUint(0b1, 1);
        b.storeAddress(self.owner);
        b.storeUint(self.poolId, 32);
        b.storeBit(self.halted);
        b.storeUint(self.ownerShare, 25);
        b.storeCoins(self.poolSupply);
        b.storeBit(self.roundClosed);
        b.storeUint(self.roundIndex, 64);
        storeCellRef<ValidatorsData>(self.validators, b, ValidatorsData.store);
        storeCellRef<NominatorsData>(self.nominators, b, NominatorsData.store);
        b.storeUint(self.maxNominators, 10);
        b.storeCoins(self.nominatorsAmount);
        b.storeCoins(self.pendingDeposits);
        b.storeCoins(self.pendingWithdrawals);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct GetNominatorData {
 >     amount: coins
 >     pendingDepositAmount: coins
 >     withdrawFound: bool
 >     reward: coins
 > }
 */
export interface GetNominatorData {
    readonly $: 'GetNominatorData'
    amount: coins
    pendingDepositAmount: coins
    withdrawFound: boolean
    reward: coins
}

export const GetNominatorData = {
    create(args: {
        amount: coins
        pendingDepositAmount: coins
        withdrawFound: boolean
        reward: coins
    }): GetNominatorData {
        return {
            $: 'GetNominatorData',
            ...args
        }
    },
    fromSlice(s: c.Slice): GetNominatorData {
        return {
            $: 'GetNominatorData',
            amount: s.loadCoins(),
            pendingDepositAmount: s.loadCoins(),
            withdrawFound: s.loadBoolean(),
            reward: s.loadCoins(),
        }
    },
    store(self: GetNominatorData, b: c.Builder): void {
        b.storeCoins(self.amount);
        b.storeCoins(self.pendingDepositAmount);
        b.storeBit(self.withdrawFound);
        b.storeCoins(self.reward);
    },
    toCell(self: GetNominatorData): c.Cell {
        return makeCellFrom<GetNominatorData>(self, GetNominatorData.store);
    }
}

/**
 > struct GetMinStake {
 >     minStake: coins
 >     minExpectedValue: coins
 > }
 */
export interface GetMinStake {
    readonly $: 'GetMinStake'
    minStake: coins
    minExpectedValue: coins
}

export const GetMinStake = {
    create(args: {
        minStake: coins
        minExpectedValue: coins
    }): GetMinStake {
        return {
            $: 'GetMinStake',
            ...args
        }
    },
    fromSlice(s: c.Slice): GetMinStake {
        return {
            $: 'GetMinStake',
            minStake: s.loadCoins(),
            minExpectedValue: s.loadCoins(),
        }
    },
    store(self: GetMinStake, b: c.Builder): void {
        b.storeCoins(self.minStake);
        b.storeCoins(self.minExpectedValue);
    },
    toCell(self: GetMinStake): c.Cell {
        return makeCellFrom<GetMinStake>(self, GetMinStake.store);
    }
}

/**
 > struct RefundContext {
 >     queryId: uint64
 >     op: uint32
 >     errorCode: uint32
 >     additionalCtx: cell?
 > }
 */
export interface RefundContext {
    readonly $: 'RefundContext'
    queryId: uint64 /* = 0 */
    op: uint32
    errorCode: uint32
    additionalCtx: c.Cell | null /* = null */
}

export const RefundContext = {
    create(args: {
        queryId?: uint64 /* = 0 */
        op: uint32
        errorCode: uint32
        additionalCtx?: c.Cell | null /* = null */
    }): RefundContext {
        return {
            $: 'RefundContext',
            queryId: 0n,
            additionalCtx: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): RefundContext {
        return {
            $: 'RefundContext',
            queryId: s.loadUintBig(64),
            op: s.loadUintBig(32),
            errorCode: s.loadUintBig(32),
            additionalCtx: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: RefundContext, b: c.Builder): void {
        b.storeUint(self.queryId, 64);
        b.storeUint(self.op, 32);
        b.storeUint(self.errorCode, 32);
        storeTolkNullable<c.Cell>(self.additionalCtx, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: RefundContext): c.Cell {
        return makeCellFrom<RefundContext>(self, RefundContext.store);
    }
}

/**
 > struct GetProxyAddressResult {
 >     evenRounds: address?
 >     oddRounds: address?
 > }
 */
export interface GetProxyAddressResult {
    readonly $: 'GetProxyAddressResult'
    evenRounds: c.Address | null
    oddRounds: c.Address | null
}

export const GetProxyAddressResult = {
    create(args: {
        evenRounds: c.Address | null
        oddRounds: c.Address | null
    }): GetProxyAddressResult {
        return {
            $: 'GetProxyAddressResult',
            ...args
        }
    },
    fromSlice(s: c.Slice): GetProxyAddressResult {
        return {
            $: 'GetProxyAddressResult',
            evenRounds: s.loadMaybeAddress(),
            oddRounds: s.loadMaybeAddress(),
        }
    },
    store(self: GetProxyAddressResult, b: c.Builder): void {
        b.storeAddress(self.evenRounds);
        b.storeAddress(self.oddRounds);
    },
    toCell(self: GetProxyAddressResult): c.Cell {
        return makeCellFrom<GetProxyAddressResult>(self, GetProxyAddressResult.store);
    }
}

/**
 > struct PoolInvariants {
 >     supplyMatch: bool
 >     pendingWithdrawalsMatch: bool
 >     pendingDepositsMatch: bool
 >     nmCountMatch: bool
 >     allMatch: bool
 >     nominatorsAmount: coins
 >     projectedBalance: coins
 >     recomputedSupply: coins
 >     recomputedPendingWithdrawals: coins
 >     recomputedPendingDeposits: coins
 >     recomputedNmCount: int
 >     recomputedTonAmount: coins
 > }
 */
export interface PoolInvariants {
    readonly $: 'PoolInvariants'
    supplyMatch: boolean
    pendingWithdrawalsMatch: boolean
    pendingDepositsMatch: boolean
    nmCountMatch: boolean
    allMatch: boolean
    nominatorsAmount: coins
    projectedBalance: coins
    recomputedSupply: coins
    recomputedPendingWithdrawals: coins
    recomputedPendingDeposits: coins
    recomputedNmCount: bigint
    recomputedTonAmount: coins
}

export const PoolInvariants = {
    create(args: {
        supplyMatch: boolean
        pendingWithdrawalsMatch: boolean
        pendingDepositsMatch: boolean
        nmCountMatch: boolean
        allMatch: boolean
        nominatorsAmount: coins
        projectedBalance: coins
        recomputedSupply: coins
        recomputedPendingWithdrawals: coins
        recomputedPendingDeposits: coins
        recomputedNmCount: bigint
        recomputedTonAmount: coins
    }): PoolInvariants {
        return {
            $: 'PoolInvariants',
            ...args
        }
    },
    fromSlice(s: c.Slice): PoolInvariants {
        throw new Error(`Can't unpack 'PoolInvariants' from cell, because 'PoolInvariants.recomputedNmCount' is 'int' (not int32/uint64/etc.)`);
    },
    store(self: PoolInvariants, b: c.Builder): void {
        throw new Error(`Can't pack 'PoolInvariants' to cell, because 'self.recomputedNmCount' is 'int' (not int32/uint64/etc.)`);
    },
    toCell(self: PoolInvariants): c.Cell {
        return makeCellFrom<PoolInvariants>(self, PoolInvariants.store);
    }
}

// ————————————————————————————————————————————
//    class NominatorPool
//

interface ExtraSendOptions {
    bounce?: boolean                    // default: false
    sendMode?: SendMode                 // default: SendMode.PAY_GAS_SEPARATELY
    extraCurrencies?: c.ExtraCurrency   // default: empty dict
}

interface DeployedAddrOptions {
    workchain?: number                  // default: 0 (basechain)
    toShard?: { fixedPrefixLength: number; closeTo: c.Address }
    overrideContractCode?: c.Cell
}

function calculateDeployedAddress(code: c.Cell, data: c.Cell, options: DeployedAddrOptions): c.Address {
    const stateInitCell = beginCell().store(c.storeStateInit({
        code,
        data,
        splitDepth: options.toShard?.fixedPrefixLength,
        special: null,
        libraries: null,
    })).endCell();

    let addrHash = stateInitCell.hash();
    if (options.toShard) {
        const shardDepth = options.toShard.fixedPrefixLength;
        addrHash = beginCell()
            .storeBits(new c.BitString(options.toShard.closeTo.hash, 0, shardDepth))
            .storeBits(new c.BitString(stateInitCell.hash(), shardDepth, 256 - shardDepth))
            .endCell()
            .beginParse().loadBuffer(32);
    }

    return new c.Address(options.workchain ?? 0, addrHash);
}

export class NominatorPool implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'ErrorsPool.InvalidWorkchain': 78,
        'ErrorsPool.QueryIdRequired': 80,
        'ErrorsPool.StakeBelowLimit': 81,
        'ErrorsPool.NotEnoughPoolBalance': 82,
        'ErrorsPool.NotEnoughValueForNewStake': 86,
        'ErrorsPool.PoolStorageNotInitialized': 90,
        'ErrorsPool.AlreadyInitialized': 91,
        'ErrorsPool.InvalidMaxMin': 92,
        'ErrorsPool.AtLeastOneRoundShouldBeAlowed': 93,
        'ErrorsPool.InvalidOwnerShare': 94,
        'ErrorsPool.InvalidValidatorShare': 95,
        'ErrorsPool.IndividualLimitIsAboveGlobal': 96,
        'ErrorsPool.IndividualLimitIsBelowGlobal': 97,
        'ErrorsPool.MinStakeBelowNetworkLimit': 98,
        'ErrorsPool.MaxStakeAboveNetworkLimit': 99,
        'ErrorsPool.NotOwner': 200,
        'ErrorsPool.OwnerNotFound': 201,
        'ErrorsPool.WithdrawalAlreadyRequested': 202,
        'ErrorsPool.DepositAlreadyRequested': 203,
        'ErrorsPool.NothingToWithdraw': 204,
        'ErrorsPool.NothingToDeposit': 205,
        'ErrorsPool.RewardIsBelowMinimal': 206,
        'ErrorsPool.DepositNotFound': 207,
        'ErrorsPool.DepositNotAllowed': 208,
        'ErrorsPool.Insolvent': 209,
        'ErrorsPool.NotEnoughGas': 300,
        'ErrorsPool.TooManyNominators': 400,
        'ErrorsPool.TooManyValidators': 401,
        'ErrorsPool.NominatorsTooDeep': 402,
        'ErrorsPool.RoundTooEarly': 501,
        'ErrorsPool.RecoveryTimeTooEarly': 502,
        'ErrorsPool.ValidatorNotFound': 600,
        'ErrorsPool.ValidatorAlreadyExits': 601,
        'ErrorsPool.MainValidatorCantBeRemoved': 602,
        'ErrorsPool.ElectionsNotStarted': 603,
        'ErrorsPool.ElectionsAlreadyEnded': 604,
        'ErrorsPool.OwnerShareIsUndercapitalized': 605,
        'ErrorsPool.StakeAboveTheLimit': 606,
        'ErrorsPool.RoundIsClosed': 607,
        'ErrorsPool.AlreadyStakedInThatRound': 608,
        'ErrorsPool.RoundNotAllowed': 609,
        'ErrorsPool.UsageRecordNotFound': 700,
        'ErrorsPool.NotFromProxy': 701,
        'ErrorsPool.PoolIsHalted': 702,
        'ErrorsPayout.InvalidSender': 800,
        'ErrorsPool.InvalidMessage': 65535,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new NominatorPool(address);
    }

    static fromStorage(emptyStorage: {
        owner: c.Address
        poolId: uint32
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? NominatorPool.CodeCell,
            data: PoolStorageNotInitialized.toCell(PoolStorageNotInitialized.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new NominatorPool(address, initialState);
    }

    static createCellOfTextComment(body: {
        comment: RemainingBitsAndRefs
    }) {
        return TextComment.toCell(TextComment.create(body));
    }

    static createCellOfUpdateVset(body: {
        queryId: uint64
    }) {
        return UpdateVset.toCell(UpdateVset.create(body));
    }

    static createCellOfNewStake(body: {
        queryId: uint64
        value: coins
        signedBody: RemainingBitsAndRefs
    }) {
        return NewStake.toCell(NewStake.create(body));
    }

    static createCellOfNewStakeOk(body: {
        queryId: uint64
        answer: uint32
        remaining: RemainingBitsAndRefs
    }) {
        return NewStakeOk.toCell(NewStakeOk.create(body));
    }

    static createCellOfNewStakeError(body: {
        queryId: uint64
        reason: uint32
        remaining: RemainingBitsAndRefs
    }) {
        return NewStakeError.toCell(NewStakeError.create(body));
    }

    static createCellOfRecoverStakeCompat(body: {
        queryId: uint64
    }) {
        return RecoverStakeCompat.toCell(RecoverStakeCompat.create(body));
    }

    static createCellOfRecoverStakeUnrestricted(body: {
        queryId: uint64
        validator: c.Address
        amount: coins
    }) {
        return RecoverStakeUnrestricted.toCell(RecoverStakeUnrestricted.create(body));
    }

    static createCellOfRecoverStakeOk(body: {
        queryId: uint64
        remaining: RemainingBitsAndRefs
    }) {
        return RecoverStakeOk.toCell(RecoverStakeOk.create(body));
    }

    static createCellOfRecoverStakeError(body: {
        queryId: uint64
        answer: uint32
        remaining: RemainingBitsAndRefs
    }) {
        return RecoverStakeError.toCell(RecoverStakeError.create(body));
    }

    static createCellOfPayoutBurnNotification(body: {
        queryId: uint64
        isWithdrawal: boolean
        owner: c.Address
        index: uint64
        roundIndex: uint64
        distribution: Distribution
    }) {
        return PayoutBurnNotification.toCell(PayoutBurnNotification.create(body));
    }

    static createCellOfAddFunds(body: {
        queryId: uint64
    }) {
        return AddFunds.toCell(AddFunds.create(body));
    }

    static createCellOfAddValidator(body: {
        queryId: uint64
        validator: c.Address
        roundAllowance: RoundAllowance
        limits: ValidatorLimitTon | ValidatorLimitShare | null
    }) {
        return AddValidator.toCell(AddValidator.create(body));
    }

    static createCellOfUpdateLimits(body: {
        queryId: uint64
        limit: GlobalValidatorsLimit | GlobalNominatorsLimit | ValidatorSpecific
    }) {
        return UpdateLimits.toCell(UpdateLimits.create(body));
    }

    static createCellOfUpdateNominatorsWhitelist(body: {
        queryId: uint64
        whitelist: c.Dictionary<c.Address, boolean>
    }) {
        return UpdateNominatorsWhitelist.toCell(UpdateNominatorsWhitelist.create(body));
    }

    static createCellOfRemoveValidator(body: {
        queryId: uint64
        validator: c.Address
    }) {
        return RemoveValidator.toCell(RemoveValidator.create(body));
    }

    static createCellOfOwnerWithdrawal(body: {
        queryId: uint64
        amount: coins
    }) {
        return OwnerWithdrawal.toCell(OwnerWithdrawal.create(body));
    }

    static createCellOfInitPoolMessage(body: {
        queryId: uint64
        mainValidator: c.Address
        roundAllowance?: RoundAllowance /* = 3 as RoundAllowance */
        limit: ValidatorLimitTon | ValidatorLimitShare | null
        ownerShare: uint25
        maxTonPerValidator: coins
        minTonPerValidator: coins
        refundBonus: uint33
        nominatorsSettings: CellRef<NominatorsSettings>
    }) {
        return InitPoolMessage.toCell(InitPoolMessage.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendTextComment(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        comment: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TextComment.toCell(TextComment.create(body)),
            ...extraOptions
        });
    }

    async sendUpdateVset(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UpdateVset.toCell(UpdateVset.create(body)),
            ...extraOptions
        });
    }

    async sendNewStake(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        value: coins
        signedBody: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: NewStake.toCell(NewStake.create(body)),
            ...extraOptions
        });
    }

    async sendNewStakeOk(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        answer: uint32
        remaining: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: NewStakeOk.toCell(NewStakeOk.create(body)),
            ...extraOptions
        });
    }

    async sendNewStakeError(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        reason: uint32
        remaining: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: NewStakeError.toCell(NewStakeError.create(body)),
            ...extraOptions
        });
    }

    async sendRecoverStakeCompat(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: RecoverStakeCompat.toCell(RecoverStakeCompat.create(body)),
            ...extraOptions
        });
    }

    async sendRecoverStakeUnrestricted(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        validator: c.Address
        amount: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: RecoverStakeUnrestricted.toCell(RecoverStakeUnrestricted.create(body)),
            ...extraOptions
        });
    }

    async sendRecoverStakeOk(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        remaining: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: RecoverStakeOk.toCell(RecoverStakeOk.create(body)),
            ...extraOptions
        });
    }

    async sendRecoverStakeError(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        answer: uint32
        remaining: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: RecoverStakeError.toCell(RecoverStakeError.create(body)),
            ...extraOptions
        });
    }

    async sendPayoutBurnNotification(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        isWithdrawal: boolean
        owner: c.Address
        index: uint64
        roundIndex: uint64
        distribution: Distribution
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: PayoutBurnNotification.toCell(PayoutBurnNotification.create(body)),
            ...extraOptions
        });
    }

    async sendAddFunds(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: AddFunds.toCell(AddFunds.create(body)),
            ...extraOptions
        });
    }

    async sendAddValidator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        validator: c.Address
        roundAllowance: RoundAllowance
        limits: ValidatorLimitTon | ValidatorLimitShare | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: AddValidator.toCell(AddValidator.create(body)),
            ...extraOptions
        });
    }

    async sendUpdateLimits(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        limit: GlobalValidatorsLimit | GlobalNominatorsLimit | ValidatorSpecific
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UpdateLimits.toCell(UpdateLimits.create(body)),
            ...extraOptions
        });
    }

    async sendUpdateNominatorsWhitelist(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        whitelist: c.Dictionary<c.Address, boolean>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UpdateNominatorsWhitelist.toCell(UpdateNominatorsWhitelist.create(body)),
            ...extraOptions
        });
    }

    async sendRemoveValidator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        validator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: RemoveValidator.toCell(RemoveValidator.create(body)),
            ...extraOptions
        });
    }

    async sendOwnerWithdrawal(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        amount: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OwnerWithdrawal.toCell(OwnerWithdrawal.create(body)),
            ...extraOptions
        });
    }

    async sendInitPoolMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        mainValidator: c.Address
        roundAllowance?: RoundAllowance /* = 3 as RoundAllowance */
        limit: ValidatorLimitTon | ValidatorLimitShare | null
        ownerShare: uint25
        maxTonPerValidator: coins
        minTonPerValidator: coins
        refundBonus: uint33
        nominatorsSettings: CellRef<NominatorsSettings>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: InitPoolMessage.toCell(InitPoolMessage.create(body)),
            ...extraOptions
        });
    }

    async getMaxPunishment(provider: ContractProvider, stake: bigint): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_max_punishment', [
            { type: 'int', value: stake },
        ]));
        return r.readBigInt();
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('owner', []));
        return r.readSlice().loadAddress();
    }

    async getPoolId(provider: ContractProvider): Promise<uint32> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_pool_id', []));
        return r.readBigInt();
    }

    async getPoolData(provider: ContractProvider): Promise<Storage> {
        const r = StackReader.fromGetMethod(13, await provider.get('get_pool_data', []));
        return ({
            $: 'Storage',
            owner: r.readSlice().loadAddress(),
            poolId: r.readBigInt(),
            halted: r.readBoolean(),
            ownerShare: r.readBigInt(),
            poolSupply: r.readBigInt(),
            roundClosed: r.readBoolean(),
            roundIndex: r.readBigInt(),
            validators: r.readCellRef<ValidatorsData>(ValidatorsData.fromSlice),
            nominators: r.readCellRef<NominatorsData>(NominatorsData.fromSlice),
            maxNominators: r.readBigInt(),
            nominatorsAmount: r.readBigInt(),
            pendingDeposits: r.readBigInt(),
            pendingWithdrawals: r.readBigInt(),
        });
    }

    async getProxyAddress(provider: ContractProvider, validator: c.Address): Promise<GetProxyAddressResult> {
        const r = StackReader.fromGetMethod(2, await provider.get('get_proxy_address', [
            { type: 'slice', cell: makeCellFrom<c.Address>(validator,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return ({
            $: 'GetProxyAddressResult',
            evenRounds: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            oddRounds: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
        });
    }

    async getNominatorData(provider: ContractProvider, nominatorAddress: bigint): Promise<GetNominatorData> {
        const r = StackReader.fromGetMethod(4, await provider.get('get_nominator_data', [
            { type: 'int', value: nominatorAddress },
        ]));
        return ({
            $: 'GetNominatorData',
            amount: r.readBigInt(),
            pendingDepositAmount: r.readBigInt(),
            withdrawFound: r.readBoolean(),
            reward: r.readBigInt(),
        });
    }

    async getValidatorInfo(provider: ContractProvider, address: c.Address): Promise<GetValidatorInfo> {
        const r = StackReader.fromGetMethod(26, await provider.get('get_validator_info', [
            { type: 'slice', cell: makeCellFrom<c.Address>(address,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return ({
            $: 'GetValidatorInfo',
            validator: ({
                $: 'Validator',
                isBanned: r.readBoolean(),
                usageState: r.readBigInt(),
                evenProxy: r.readNullable<uint256>(
                    (r) => r.readBigInt()
                ),
                oddProxy: r.readNullable<uint256>(
                    (r) => r.readBigInt()
                ),
                limit: r.readUnionType<ValidatorLimitTon | ValidatorLimitShare | null>(2, {
                    133: [1, null,
                        (r) => ({
                            $: 'ValidatorLimitTon',
                            maxTon: r.readBigInt(),
                        })
                    ],
                    134: [1, null,
                        (r) => ({
                            $: 'ValidatorLimitShare',
                            maxShare: r.readBigInt(),
                        })
                    ],
                    0: [1, null,
                        (r) => r.readNullLiteral()
                    ],
                }),
                roundParity: r.readBigInt(),
            }),
            usage: ({
                $: 'ValidatorUsageRecords',
                curRoundUsage: r.readWideNullable<ValidatorUsageStats>(8,
                    (r) => ({
                        $: 'ValidatorUsageStats',
                        proxy: r.readBigInt(),
                        usage: ({
                            $: 'TonUsage',
                            heldFor: r.readBigInt(),
                            tonUsed: r.readBigInt(),
                            validator: r.readSlice().loadAddress(),
                            rotation: ({
                                $: 'RotationData',
                                vsetHash: r.readBigInt(),
                                rotationTime: r.readBigInt(),
                                rotationCount: r.readBigInt(),
                            }),
                        }),
                    })
                ),
                prevRoundUsage: r.readWideNullable<ValidatorUsageStats>(8,
                    (r) => ({
                        $: 'ValidatorUsageStats',
                        proxy: r.readBigInt(),
                        usage: ({
                            $: 'TonUsage',
                            heldFor: r.readBigInt(),
                            tonUsed: r.readBigInt(),
                            validator: r.readSlice().loadAddress(),
                            rotation: ({
                                $: 'RotationData',
                                vsetHash: r.readBigInt(),
                                rotationTime: r.readBigInt(),
                                rotationCount: r.readBigInt(),
                            }),
                        }),
                    })
                ),
            }),
            stakeable: r.readBigInt(),
            roundIndex: r.readBigInt(),
            rotated: r.readBoolean(),
        });
    }

    async getValidatorInfoMtc(provider: ContractProvider, workchain: bigint, hash: bigint): Promise<GetValidatorInfo> {
        const r = StackReader.fromGetMethod(26, await provider.get('get_validator_info_mtc', [
            { type: 'int', value: workchain },
            { type: 'int', value: hash },
        ]));
        return ({
            $: 'GetValidatorInfo',
            validator: ({
                $: 'Validator',
                isBanned: r.readBoolean(),
                usageState: r.readBigInt(),
                evenProxy: r.readNullable<uint256>(
                    (r) => r.readBigInt()
                ),
                oddProxy: r.readNullable<uint256>(
                    (r) => r.readBigInt()
                ),
                limit: r.readUnionType<ValidatorLimitTon | ValidatorLimitShare | null>(2, {
                    133: [1, null,
                        (r) => ({
                            $: 'ValidatorLimitTon',
                            maxTon: r.readBigInt(),
                        })
                    ],
                    134: [1, null,
                        (r) => ({
                            $: 'ValidatorLimitShare',
                            maxShare: r.readBigInt(),
                        })
                    ],
                    0: [1, null,
                        (r) => r.readNullLiteral()
                    ],
                }),
                roundParity: r.readBigInt(),
            }),
            usage: ({
                $: 'ValidatorUsageRecords',
                curRoundUsage: r.readWideNullable<ValidatorUsageStats>(8,
                    (r) => ({
                        $: 'ValidatorUsageStats',
                        proxy: r.readBigInt(),
                        usage: ({
                            $: 'TonUsage',
                            heldFor: r.readBigInt(),
                            tonUsed: r.readBigInt(),
                            validator: r.readSlice().loadAddress(),
                            rotation: ({
                                $: 'RotationData',
                                vsetHash: r.readBigInt(),
                                rotationTime: r.readBigInt(),
                                rotationCount: r.readBigInt(),
                            }),
                        }),
                    })
                ),
                prevRoundUsage: r.readWideNullable<ValidatorUsageStats>(8,
                    (r) => ({
                        $: 'ValidatorUsageStats',
                        proxy: r.readBigInt(),
                        usage: ({
                            $: 'TonUsage',
                            heldFor: r.readBigInt(),
                            tonUsed: r.readBigInt(),
                            validator: r.readSlice().loadAddress(),
                            rotation: ({
                                $: 'RotationData',
                                vsetHash: r.readBigInt(),
                                rotationTime: r.readBigInt(),
                                rotationCount: r.readBigInt(),
                            }),
                        }),
                    })
                ),
            }),
            stakeable: r.readBigInt(),
            roundIndex: r.readBigInt(),
            rotated: r.readBoolean(),
        });
    }

    async getLimitsPerValidator(provider: ContractProvider): Promise<[
        coins,
        coins,
        bigint,
    ]> {
        const r = StackReader.fromGetMethod(3, await provider.get('get_limits_per_validator', []));
        return [
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
        ];
    }

    async getNominatorMinimalStake(provider: ContractProvider): Promise<GetMinStake> {
        const r = StackReader.fromGetMethod(2, await provider.get('get_nominator_minimal_stake', []));
        return ({
            $: 'GetMinStake',
            minStake: r.readBigInt(),
            minExpectedValue: r.readBigInt(),
        });
    }

    async getPoolInvariants(provider: ContractProvider): Promise<PoolInvariants> {
        const r = StackReader.fromGetMethod(12, await provider.get('get_pool_invariants', []));
        return ({
            $: 'PoolInvariants',
            supplyMatch: r.readBoolean(),
            pendingWithdrawalsMatch: r.readBoolean(),
            pendingDepositsMatch: r.readBoolean(),
            nmCountMatch: r.readBoolean(),
            allMatch: r.readBoolean(),
            nominatorsAmount: r.readBigInt(),
            projectedBalance: r.readBigInt(),
            recomputedSupply: r.readBigInt(),
            recomputedPendingWithdrawals: r.readBigInt(),
            recomputedPendingDeposits: r.readBigInt(),
            recomputedNmCount: r.readBigInt(),
            recomputedTonAmount: r.readBigInt(),
        });
    }
}
