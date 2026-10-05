# 行业法规索引与流程合规指引

此模块为 14 个行业/通用场景提供带官方来源链接的法规索引，并将重点要求映射到现有行业流程模板中的风险、控制设计、测试程序、样本总体与建议证据。当前索引包含中国大陆、香港、澳门、台湾及部分境外法域。可从左侧“法规与流程合规”进入；默认行业来自当前公司的行业档案。行业切换仅改变参考范围，不会改写公司数据。

## 数据和使用方式

- API：`GET /api/compliance-library?organization_id=...`。请求先通过公司成员权限校验，公司实际业务流程从 PostgreSQL 读取；法规和参考流程为随版本维护的本地知识库。
- 法规条目记录标题、发布/主管机关、类别、全国/属地范围、摘要、关键义务、流程标签、适用行业、官方来源、适用边界、施行日期（仅在来源核实后填写）及本次核对日期。国家及地区通过单一下拉框筛选，选项顺序为中国大陆、中国香港、中国澳门、中国台湾、其他国家/地区；港澳台三个法域分别筛选、分别展示。
- 14 个行业均从行业参考库读取流程建议：食品饮料与连锁餐饮 8 条，其余行业 5 条起步流程。流程名称、业务风险、目标、控制设计、测试、抽样总体和证据示例来自行业参考库；另外补充法规关注点、风险提示、检查点和关联法规 ID。
- 法规分类包括公司治理、财务会计、食品安全、产品质量、网络交易、个人信息与数据安全、专业执业、道路运输、工程建设、医疗、教育、农业、能源等。
- 页面提供关键字与类别筛选、法规官方原文链接、公司实际流程关联选择，以及进入“业务流程”继续维护的入口。

## 法规信息的维护规则

1. 优先使用全国人大、国务院/司法部国家法律法规数据库、主管部委、国家级监管机构的法规正文或官方发布页。无法找到国家级直达正文时，明确注明来源层级及交叉核验要求。
2. 在数据条目中区分法律、行政法规、部门规章、规范性文件和制度/框架，不把推荐控制或国际框架描述成中国法定义务。
3. 记录来源页面实际确认的施行日期；无法从可靠来源确认时留空。修法动态、废止状态和目录范围不能只凭法规标题推断。
4. 每个条目必须说明主体、业务或地区范围，并标注条件适用、许可、规模、数据类型、商品/服务或地方规则边界。
5. 内容当前以中国大陆规则及香港、澳门、台湾的基础横向法规为起点，按维护批次注明核对日期（当前代码版本为 2026-10-02）。港澳台条目是行业常见主题的起步索引，不是地区法规全集；本模块不自动监控法规变化，维护者应定期复核链接、效力和适用边界，并更新版本说明。
6. 新增行业时同步提供至少三条实际业务流程映射，并验证法规 ID 有效、风险提示与控制检查点可对应、样本总体和证据足以支持可重演测试。

## 重要适用边界

本索引是公开资料的起步索引和内控设计参考，不是穷尽的法定义务清单、法律意见、监管解释或企业合规结论。具体适用取决于企业主体、地域、组织/牌照、实际业务、产品与交易渠道、数据类型、规模及最新监管规则。金融条目特别区分持牌银行保险机构与一般金融服务公司；危险货物、医疗、特种设备、校外培训、生产许可等条目只在其法定范围内适用。实施前应通过国家及属地主管机关核实现行文本和施行/废止状态，必要时由企业法务或专业顾问复核。

香港、澳门和台湾使用各自独立的法规体系，不能用中国大陆法规条目替代。香港《个人资料（私隐）条例》及台湾《个人资料保护法》的修法/跨境条文生效状态应按官方现行文本逐条确认；澳门《网络安全法》以及台湾《资通安全管理法》存在主体范围限制，不应配置为所有一般企业的统一义务。澳门商法典页面显示其曾经修订，引用时应使用官方最新整合文本。法规卡片按业务领域自动匹配流程，仅作风险识别提示，并不构成适用性判断。

## 当前核对使用的主要官方来源

- [公司法（中国人大网）](https://www.npc.gov.cn/npc/c2/c30834/202312/t20231229_433954.html)、[个人信息保护法（国家网信办，全文转载中国人大网）](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm)、[数据安全法（国家网信办，全文转载新华社）](https://www.cac.gov.cn/2021-06/11/c_1624994566919140.htm)
- [会计法（2024年修正，财政部，全文转载中国人大网）](https://kjs.mof.gov.cn/zt/kjfxcgc/kjfqw/202408/t20240814_3941788.htm)、[新加坡个人数据保护法（Singapore Statutes Online）](https://sso.agc.gov.sg/Act/PDPA2012/)
- [网络数据安全管理条例（司法部国家行政法规库）](https://xzfg.moj.gov.cn/front/law/detail?LawID=1734)、[网络交易监督管理办法（市场监管总局）](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_4b47c79b8d994a42bba4835997688faa.html)、[消费者权益保护法实施条例（中国政府网）](https://app.www.gov.cn/govdata/gov/202403/19/513111/article.html)
- [食品安全法（2025年修正，人大常委会公报）](https://sjfg.samr.gov.cn/law/file/pdf/3238901/1763351546670.pdf)、[食品安全追溯规定（市场监管总局）](https://www.samr.gov.cn/zw/zfxxgk/zc/xzgfxwj/art/2023/art_f8b5b891508c495c9aceee58013cb478.html)、[餐饮服务连锁企业食品安全责任规定（市场监管总局）](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_09105249f5984a2fb507e88cd346f20d.html)
- [网络安全法修正信息（司法部普法平台，2026-01-01施行）](https://legalinfo.moj.gov.cn/pub/sfbzhfx/zhfxfzzx/fzzxyw/202510/t20251028_526997.html)、[安全生产法（应急管理部）](https://www.mem.gov.cn/fw/flfgbz/fg/202107/t20210716_416558.shtml)、[特种设备安全法（市场监管总局）](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2023/art_ad5e293574484b48b45047ee0ede6099.html)、[产品质量法（市场监管总局）](https://www.samr.gov.cn/zfjcj/tzgg/art/2023/art_579118cd202a45fba28b7edfd9f6fd72.html)
- [电子商务法（中国人大网）](https://www.npc.gov.cn/npc/c1773/c1848/c21114/c31834/c31841/201905/t20190521_266893.html)、[医疗机构管理条例（国家卫健委）](https://www.nhc.gov.cn/fzs/c100048/202303/79ba042296184726bd100d6fecea177c.shtml)、[医疗质量管理办法（国家卫健委）](https://www.nhc.gov.cn/wjw/c100221/202201/d2633bf795e443b6a879f27e408539f3.shtml)
- [道路运输条例（司法部国家行政法规库）](https://xzfg.moj.gov.cn/mobile/law/detail?LawID=1488)、[道路危险货物运输管理规定（交通运输部，2026修正）](https://xxgk.mot.gov.cn/gz/202602/t20260213_4200295.html)
- [建设工程质量管理条例（北京市政府法规页）](https://www.beijing.gov.cn/zhengce/gwywj/202206/t20220617_2744828.html)、[建设工程安全生产管理条例（北京市政府法规页）](https://www.beijing.gov.cn/zhengce/zhengcefagui/qtwj/202307/t20230719_3165890.html)
- [银行保险机构操作风险管理办法（司法部）](https://www.moj.gov.cn/pub/sfbgw/flfggz/flfggzbmgz/202409/t20240918_506158.html)、[注册会计师法（2026修正，财政部）](https://kjs.mof.gov.cn/zhengcefabu/202608/t20260810_3995181.htm)、[律师法（国家法律法规数据库）](https://flk.npc.gov.cn/detail?fileId=&id=2c909fdd678bf17901678bf867e80a55&title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%BE%8B%E5%B8%88%E6%B3%95&type=)
- [民办教育促进法现行有效法律目录（中国人大网）](https://www.npc.gov.cn/npc/c2/c30834/202403/t20240301_434977.html)、[校外培训行政处罚暂行办法（教育部）](https://www.moe.gov.cn/srcsite/A02/s5911/moe_621/202309/t20230912_1079788.html)、[农产品质量安全法（市场监管总局）](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/bgt/art/2023/art_f5a0c2c6c3724a6aad91645043b012ce.html)
- [能源法施行信息（国家能源局）](https://www.nea.gov.cn/2024-12/03/c_1212408329.htm)、[电力重大事故隐患管理规则（国家发展改革委）](https://zfxxgk.ndrc.gov.cn/web/iteminfo.jsp?id=20619)
- 香港：[个人资料（私隐）条例（电子法例）](https://www.elegislation.gov.hk/hk/cap486!en)、[公司条例（公司注册处）](https://www.cr.gov.hk/en/legislation/companies-ordinance/cap622/companies-ordinance.htm)、[雇佣条例（劳工处）](https://www.labour.gov.hk/eng/legislat/content2.htm)、[职业安全及健康条例（劳工处）](https://www.labour.gov.hk/eng/legislat/content4.htm)、[食物安全条例（食物安全中心）](https://www.cfs.gov.hk/tc_chi/foodsafetyordinance/food_safety_ordinance.html)、[商品说明条例（海关）](https://www.customs.gov.hk/hcms/filemanager/en/content_189/tdo_e.pdf)
- 澳门：[商法典（澳门特别行政区公报）](https://bo.dsaj.gov.mo/bo/i/99/31/codcomcn/codcom0001.asp)、[个人资料保护法](https://bo.dsaj.gov.mo/bo/i/2005/34/lei08_cn.asp)、[劳动关系法](https://bo.dsaj.gov.mo/bo/i/2008/33/lei07_cn.asp)、[食品安全法](https://bo.dsaj.gov.mo/bo/i/2013/17/lei05_cn.asp)、[消费者权益保护法](https://bo.dsaj.gov.mo/bo/i/2021/28/lei09_cn.asp)、[网络安全法](https://bo.dsaj.gov.mo/bo/i/2019/25/lei13_cn.asp)
- 台湾：[公司法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0080001)、[个人资料保护法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)、[劳动基准法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030001)、[职业安全卫生法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0060001)、[食品安全卫生管理法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0040001)、[消费者保护法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170001)、[资通安全管理法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030297)

## 原文链接可访问性核对（2026-10-03）

对法规索引中 94 个唯一来源地址进行链接探测，并在浏览器中复核出现异常的重点条目。确认人大公报 PDF 域名证书过期，涉及《数据安全法》和 2024 年修正《会计法》；原《个人信息保护法》地址进入人大站防护跳转后无法建立 TLS 连接。上述三项已换成可直接打开的官方全文页。新加坡 PDPA 原条目跳转至监管介绍页，已改为新加坡总检察署官方《个人数据保护法》现行全文。

本次测试网络无法与香港电子法例及台湾法务部法规资料库建立隧道连接；这只能说明当前测试出口访问失败，不能据此认定官方链接失效，因此保留原链接，建议从可直连香港/台湾政府网站的网络再次复测。本核对只确认页面可访问及指向的法规文本，不代表已完成全部条文的现行效力、修法或适用性审查。
