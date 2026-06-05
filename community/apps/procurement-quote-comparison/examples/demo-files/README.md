# Procurement Quote Comparison Demo Files

These files are demo inputs for the procurement quote comparison plugin.

## Demo Flow

1. Upload `采购需求单-研发中心办公电脑更新采购.xlsx` to create a procurement project.
2. Open the generated procurement project detail page.
3. Upload the three supplier quote files:
   - `报价单-上海启明科技有限公司.xlsx`
   - `报价单-苏州华辰办公科技有限公司.xlsx`
   - `报价单-杭州云帆智能设备有限公司.xlsx`
4. Run requirement parsing.
5. Run supplier quote batch parsing.
6. Generate comparison results and review AI recommendations.

## Scenario

The demo case is an office computer refresh procurement for the R&D center.
It includes one procurement requirement file and three supplier quote files.
The quote data intentionally includes tradeoffs across price, delivery time,
payment terms, and warranty so the AI recommendation can explain why the
lowest price is not necessarily the best choice.
