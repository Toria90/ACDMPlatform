pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IERC20MintBurn.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BokkyPooBahsRedBlackTreeLibrary.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";

contract AcdmPlatform is AccessControl {
    using BokkyPooBahsRedBlackTreeLibrary for BokkyPooBahsRedBlackTreeLibrary.Tree;
    
    mapping(address => Participant) public participants;
    address public acdmToken;
    uint8 private _acdmTokenDecimals;
    uint256 public roundTimeMs;
    
    Commission public referrer1Commission;
    Commission public referrer2Commission;

    SaleRound public saleRound;
    uint256 public saleVolume;
    TradeRound public tradeRound;
    
    uint256 private _nextOrderId;
    mapping(uint256 => Order) public orders;
    BokkyPooBahsRedBlackTreeLibrary.Tree private _priceTree;
    mapping(uint256 => BokkyPooBahsRedBlackTreeLibrary.Tree) private _priceOrders;
    
    address public owner;
    address public uniswapV2Router;
    address public xxxToken;
    address public weth;

    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    struct Participant{
        bool registered;
        address referrer;
    }
    
    struct SaleRound{
        uint256 startTime;
        uint256 price;
    }
    
    struct TradeRound{
        uint256 startTime;
        uint256 total;
    }
    
    struct Order{
        uint256 amount;
        uint256 price;
        uint256 executedAmount;
        address creator;
    }
    
    struct Commission{
        uint256 saleCoefficient;
        uint256 saleCoefficientDecimals;
        uint256 tradeCoefficient;
        uint256 tradeCoefficientDecimals;
    }
    
    constructor(
        address _acdmToken, 
        address daoContract, 
        uint256 _roundTimeMs, 
        address _owner, 
        address _uniswapV2Router, 
        address _xxxToken, 
        address _weth) {
        
        acdmToken = _acdmToken;
        _acdmTokenDecimals = IERC20MintBurn(acdmToken).decimals();
        roundTimeMs = _roundTimeMs;

        referrer1Commission.saleCoefficient = 5;
        referrer1Commission.saleCoefficientDecimals = 2;
        referrer1Commission.tradeCoefficient = 25;
        referrer1Commission.tradeCoefficientDecimals = 3;
        
        referrer2Commission.saleCoefficient = 3;
        referrer2Commission.saleCoefficientDecimals = 2;
        referrer2Commission.tradeCoefficient = 25;
        referrer2Commission.tradeCoefficientDecimals = 3;
        
        tradeRound.total = 1;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(DAO_ROLE, daoContract);
        
        _nextOrderId = 1;
        
        owner = _owner;
        uniswapV2Router = _uniswapV2Router;
        xxxToken = _xxxToken;
        weth = _weth;
    }
    
    function setReferrer1CommissionSaleCoefficient(uint256 value, uint256 decimals) public onlyRole(DAO_ROLE){
        require(referrer2Commission.saleCoefficient/10**referrer2Commission.saleCoefficientDecimals + value/10**decimals < 1, "wrong data");
        
        referrer1Commission.saleCoefficient = value;
        referrer1Commission.saleCoefficientDecimals = decimals;
    }

    function setReferrer1CommissionTradeCoefficient(uint256 value, uint256 decimals) public onlyRole(DAO_ROLE){
        referrer1Commission.tradeCoefficient = value;
        referrer1Commission.tradeCoefficientDecimals = decimals;
    }

    function setReferrer2CommissionSaleCoefficient(uint256 value, uint256 decimals) public onlyRole(DAO_ROLE){
        referrer2Commission.saleCoefficient = value;
        referrer2Commission.saleCoefficientDecimals = decimals;
    }

    function setReferrer2CommissionTradeCoefficient(uint256 value, uint256 decimals) public onlyRole(DAO_ROLE){
        referrer2Commission.tradeCoefficient = value;
        referrer2Commission.tradeCoefficientDecimals = decimals;
    }
    
    function register(address referrer) public {
        require(participants[msg.sender].registered == false, "already registered");
        require(referrer == address(0) || participants[referrer].registered, "referrer isn't registered");
        
        participants[msg.sender].registered = true;
        participants[msg.sender].referrer = referrer;
    }
    
    function startSaleRound() public {
        require(tradeRound.startTime + roundTimeMs < block.timestamp, "trade round isn't finished");
        require(saleRound.startTime == 0 || tradeRound.startTime > saleRound.startTime, "sale round already started");

        saleRound.price = nextSaleRoundPrice(); 
        saleVolume = tradeRound.total/saleRound.price * (10 ** _acdmTokenDecimals);
        saleRound.startTime = block.timestamp;
        
        if (saleVolume > 0) IERC20MintBurn(acdmToken).mint(address(this), saleVolume);
    }
    
    function buyAcdm() public payable {
        require(saleRound.startTime > tradeRound.startTime, "sale round is finished");

        uint256 buyVolume = msg.value / saleRound.price * 10**_acdmTokenDecimals;
        if (buyVolume > saleVolume) buyVolume = saleVolume;
        saleVolume -= buyVolume;
        uint256 residue = msg.value - buyVolume * saleRound.price / 10**_acdmTokenDecimals;

        SafeERC20.safeTransfer(IERC20MintBurn(acdmToken), msg.sender, buyVolume);
        _sendSaleRoundCommission(msg.sender, msg.value - residue);

        if (residue > 0) payable(msg.sender).send(residue);
    }
    
    function startTradeRound() public {
        require(saleRound.startTime>0 && (saleRound.startTime + roundTimeMs < block.timestamp || saleVolume==0), "sale round isn't finished");
        require(saleRound.startTime > tradeRound.startTime, "trade round already started");
        
        if (saleVolume > 0) IERC20MintBurn(acdmToken).burn(address(this), saleVolume);
        
        tradeRound.startTime = block.timestamp;
        tradeRound.total = 0;
    }
    
    function addOrder(uint256 amount, uint256 price) public {
        require(tradeRound.startTime > saleRound.startTime, "trade round isn't started");
        require(amount>0, "wrong amount");
        require(price>0, "wrong price");
        require(IERC20MintBurn(acdmToken).allowance(msg.sender, address(this))>=amount, "not enough allowance");
        
        orders[_nextOrderId].creator = msg.sender;
        orders[_nextOrderId].amount = amount;
        orders[_nextOrderId].price = price;
        
        if(_priceTree.exists(price) == false) _priceTree.insert(price);
        _priceOrders[price].insert(_nextOrderId);
        
        _nextOrderId ++;
        
        SafeERC20.safeTransferFrom(IERC20MintBurn(acdmToken), msg.sender, address(this), amount);
    }
    
    function removeOrder(uint256 orderId) public {
        require(orders[orderId].amount > 0, "order by order id not exists");
        require(orders[orderId].creator == msg.sender, "isn't creator");

        SafeERC20.safeTransfer(IERC20MintBurn(acdmToken), orders[orderId].creator, orders[orderId].amount - orders[orderId].executedAmount);

        _deleteOrder(orderId);
    }
    
    function redeemOrder() public payable {
        require(tradeRound.startTime > saleRound.startTime, "trade round isn't started");
        
        uint256 totalResidue = msg.value;
        uint256 soldTokens = 0;
        uint256 currentOrderSaleAmount = 0;
        uint256 currentOrderSaleTotal = 0;
        uint256 currentOrderPlatformCommission = 0;
        uint256 currentOrderPrice = _priceTree.first();
        uint256 currentOrderId = _priceOrders[currentOrderPrice].first();
        while(totalResidue > 0 && currentOrderPrice > 0){
            currentOrderSaleAmount = totalResidue / orders[currentOrderId].price * 10**_acdmTokenDecimals;
            if (currentOrderSaleAmount==0) break;
            if (currentOrderSaleAmount > orders[currentOrderId].amount)
                currentOrderSaleAmount = orders[currentOrderId].amount;

            soldTokens += currentOrderSaleAmount;
            currentOrderSaleTotal = currentOrderSaleAmount * orders[currentOrderId].price / 10**_acdmTokenDecimals;
            totalResidue -= currentOrderSaleTotal;
            
            orders[currentOrderId].executedAmount += currentOrderSaleAmount;

            currentOrderPlatformCommission = _sendTradeRoundCommission(orders[currentOrderId].creator, currentOrderSaleTotal);

            payable(orders[currentOrderId].creator).send(currentOrderSaleAmount * orders[currentOrderId].price / 10**_acdmTokenDecimals - currentOrderPlatformCommission);
            
            if (orders[currentOrderId].amount == orders[currentOrderId].executedAmount) _deleteOrder(currentOrderId);

            currentOrderPrice = _priceTree.first();
            currentOrderId = _priceOrders[currentOrderPrice].first();
        }
        
        tradeRound.total += msg.value - totalResidue;
        if (soldTokens > 0) SafeERC20.safeTransfer(IERC20MintBurn(acdmToken), msg.sender, soldTokens);
        if (totalResidue>0) payable(msg.sender).send(totalResidue);
    }

    function nextSaleRoundPrice() public view returns (uint256) {
        return saleRound.price==0 ? 0.00001 * 1 ether : (saleRound.price * 103 / 100 + 0.000004 * 1 ether);
    }

    
    function sendToOwner(uint256 amount) public onlyRole(DAO_ROLE) {
        payable(owner).send(amount);
    }
    
    function swapExactETHForTokens(uint256 amount) public onlyRole(DAO_ROLE) {
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = xxxToken;
        IUniswapV2Router01(uniswapV2Router).swapETHForExactTokens{value: address(this).balance}(amount, path, address(this), block.timestamp + 1);
    }
     
    function burnXxxTokens(uint256 amount) public onlyRole(DAO_ROLE) {
        IERC20MintBurn(xxxToken).burn(address(this), amount);
    }

    receive() external payable {
    }
    
    
    function _deleteOrder(uint256 orderId) private {
        _priceOrders[orders[orderId].price].remove(orderId);
        if (_priceOrders[orders[orderId].price].root == 0) _priceTree.remove(orders[orderId].price);
        delete orders[orderId];
    }

    function _sendSaleRoundCommission(address account, uint256 amount) private {
        if (participants[account].referrer != address(0)){
            payable(participants[account].referrer).send(referrer1Commission.saleCoefficient * msg.value / 10**referrer1Commission.saleCoefficientDecimals);
            if (participants[participants[account].referrer].referrer != address(0)){
                payable(participants[participants[account].referrer].referrer).send(referrer2Commission.saleCoefficient * msg.value / 10**referrer2Commission.saleCoefficientDecimals);
            }
        }
    }

    function _sendTradeRoundCommission(address account, uint256 amount) private returns(uint256) {
        if (participants[account].referrer != address(0)){
            payable(participants[account].referrer).send(referrer1Commission.tradeCoefficient * amount / 10**referrer1Commission.tradeCoefficientDecimals);
            if (participants[participants[account].referrer].referrer != address(0)){
                payable(participants[participants[account].referrer].referrer).send(referrer2Commission.tradeCoefficient * amount / 10**referrer2Commission.tradeCoefficientDecimals);
            }
            else {
                return referrer2Commission.tradeCoefficient * amount / 10**referrer2Commission.tradeCoefficientDecimals;
            }
            return 0;
        }
        else {
            return referrer1Commission.tradeCoefficient * amount / 10**referrer1Commission.tradeCoefficientDecimals
            + referrer2Commission.tradeCoefficient * amount / 10**referrer2Commission.tradeCoefficientDecimals;
        }
    }
    
}
