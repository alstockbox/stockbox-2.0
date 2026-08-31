import { describe, expect, it } from "vitest";
import { parseForm4Xml } from "./sec-insiders";

describe("parseForm4Xml",()=>{
  it("parses open market non-derivative transactions without inventing missing fields",()=>{
    const xml=`<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>Jane Doe</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector><officerTitle>Chief Financial Officer</officerTitle></reportingOwnerRelationship></reportingOwner><nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-08-20</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>100</value></transactionShares><transactionPricePerShare><value>25.50</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;
    const result=parseForm4Xml(xml,{filingDate:"2026-08-21",url:"https://sec.example/form4"});
    expect(result[0]?.transactionType).toBe("open_market_buy");
    expect(result[0]?.value).toBe(2550);
    expect(result[0]?.insiderRole).toContain("Chief Financial Officer");
  });
});
